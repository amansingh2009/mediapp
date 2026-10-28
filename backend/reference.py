"""Public source lookups. No prescription/user data is persisted here."""
import asyncio
from difflib import SequenceMatcher
import hashlib
import ipaddress
import json
import math
import os
import re
import time
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import httpx
import nhs_reference

CACHE=Path(__file__).parent / '.cache'
ALIASES={'paracetamol':'acetaminophen','salbutamol':'albuterol','vertin':'betahistine'}
CATALOG=json.loads((Path(__file__).parent / 'medicine_catalog.json').read_text())
GOOGLE_PLACES_KEY=os.getenv('GOOGLE_PLACES_API_KEY','').strip()


async def ip_location(value=None):
    address=''
    if value:
        try:
            parsed=ipaddress.ip_address(value)
            if parsed.is_global: address=f'{parsed}/'
        except ValueError:
            pass
    async with httpx.AsyncClient(timeout=8,headers={'User-Agent':'MediappDevelopment/1.0'}) as client:
        response=await client.get(f'https://ipapi.co/{address}json/')
        response.raise_for_status()
    payload=response.json()
    lat,lon=payload.get('latitude'),payload.get('longitude')
    if not isinstance(lat,(int,float)) or not isinstance(lon,(int,float)): raise LookupError('Approximate location unavailable')
    return {'lat':lat,'lon':lon,'city':payload.get('city') or 'Nearby','country':payload.get('country_code')}


async def information(name):
    name=' '.join(name.lower().strip().split())
    if not re.fullmatch(r'[a-z][a-z0-9 ()/+-]{1,99}',name): raise ValueError('Invalid medicine name')
    query=ALIASES.get(name,name); key=hashlib.sha256(('v8:'+query).encode()).hexdigest(); path=CACHE / f'{key}.json'
    if path.exists() and time.time()-path.stat().st_mtime<7*86400: return json.loads(path.read_text())
    params={'search':f'openfda.generic_name.exact:"{query.upper()}"','limit':10}
    async with httpx.AsyncClient(timeout=18) as client:
        response=await client.get('https://api.fda.gov/drug/label.json',params=params)
        rows=[]
        if response.status_code!=404:
            response.raise_for_status(); rows=response.json().get('results',[])
        rows=[row for row in rows if any(g.lower()==query for g in row.get('openfda',{}).get('generic_name',[]))]
        result={'uses':None,'general_dosage':None,'common_effects':None,'serious_effects':None,'adverse_reactions':None,'warnings':None,
          'ingredients':['Betahistine'] if query=='betahistine' else [],'other_ingredients':[],
          'source':None,'label_date':None,'fetched_at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'routes':[],'sources':[]}
        if rows:
            oral=[row for row in rows if 'ORAL' in row.get('openfda',{}).get('route',[])]
            label=(oral or rows)[0]
            def field(key): return '\n'.join(label.get(key,[]))[:16000] or None
            # Do not invent a common/serious split when the source only has one adverse section.
            result.update({'uses':field('indications_and_usage') or field('purpose'), 'general_dosage':field('dosage_and_administration'), 'serious_effects':field('boxed_warning'), 'adverse_reactions':field('adverse_reactions'), 'warnings':field('warnings') or field('warnings_and_cautions') or field('precautions'), 'ingredients':label.get('active_ingredient',[]) or label.get('openfda',{}).get('substance_name',[]), 'other_ingredients':label.get('inactive_ingredient',[]), 'source':str(response.url), 'label_date':label.get('effective_time'), 'routes':label.get('openfda',{}).get('route',[])})
            result['sources'].append({'label':'FDA · reference product label', 'url':str(response.url)})
        try:
            extra=await nhs_reference.lookup(client, query)
            if extra:
                result.update({k:v for k,v in extra.items() if k!='source'})
                for source in (extra.get('source'), extra.get('general_dosage_source')):
                    if source and not any(item.get('url')==source.get('url') for item in result['sources']):
                        result['sources'].append(source)
        except httpx.HTTPError:
            pass  # Keep available FDA data; unreturned categories remain explicit.
    if not result['sources']: raise LookupError('No reference information found')
    CACHE.mkdir(exist_ok=True); path.write_text(json.dumps(result)); return result


def _normalise_medicine(value):
    return re.sub(r'[^a-z0-9]+', ' ', value.casefold()).strip()


def _candidate_score(query, candidate):
    left, right = _normalise_medicine(query), _normalise_medicine(candidate)
    if not left or not right: return 0
    # Compare the complete name. Token-level matches promoted unrelated drugs
    # when OCR produced a short shared fragment such as a strength or "E2".
    return SequenceMatcher(None, left, right).ratio()


async def medicine_matches(query):
    """Return sourced spellings to help review an OCR name; never rewrite it."""
    query=' '.join(query.strip().split())
    if not re.fullmatch(r'[A-Za-z0-9 .()+/-]{2,100}', query): raise ValueError('Invalid medicine name')
    rows=[]
    for item in CATALOG.get('entries',[]):
        name=item['brand']
        score=_candidate_score(query, name)
        for strength in item.get('strengths',[]):
            score=max(score,_candidate_score(query, f'{name} {strength}'))
        if score>=.55:
            rows.append({'name':name,'ingredient':item['ingredient'],'strengths':item.get('strengths',[]),'score':round(score,3),'source':item['source']})
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response=await client.get('https://rxnav.nlm.nih.gov/REST/approximateTerm.json',params={'term':query,'maxEntries':8,'option':1})
            if response.status_code==200:
                for item in response.json().get('approximateGroup',{}).get('candidate',[]):
                    name=item.get('name')
                    if not name: continue
                    score=_candidate_score(query,name)
                    if score>=.55:
                        rows.append({'name':name,'ingredient':None,'strengths':[],'score':round(score,3),'source':'https://rxnav.nlm.nih.gov/REST/approximateTerm.json'})
    except httpx.HTTPError:
        pass
    unique={_normalise_medicine(row['name']):row for row in rows}
    ranked=sorted(unique.values(),key=lambda row:row['score'],reverse=True)
    return {'query':query,'matches':ranked[:5],'source':'RxNorm and curated manufacturer catalog','review_required':True}


suggestion_cache={}
async def suggestions(query,country=None,lat=None,lon=None):
    key=' '.join(query.strip().split())
    if len(key)<3: return {'suggestions':[]}
    cache_key=(key.lower(),country,round(lat,2) if lat is not None else None,round(lon,2) if lon is not None else None)
    cached=suggestion_cache.get(cache_key)
    if cached and time.monotonic()-cached[0]<300: return cached[1]
    if not GOOGLE_PLACES_KEY: raise RuntimeError('Google Places is not configured')
    async with httpx.AsyncClient(timeout=12,headers={'User-Agent':'MediappDevelopment/1.0'}) as client:
        body={'input':key,'includedPrimaryTypes':['(cities)'],'includedRegionCodes':[(country or 'IN').lower()],'regionCode':(country or 'IN').lower(),'languageCode':'en'}
        if lat is not None and lon is not None:
            body['origin']={'latitude':lat,'longitude':lon}
            body['locationBias']={'circle':{'center':{'latitude':lat,'longitude':lon},'radius':50000}}
        response=await client.post('https://places.googleapis.com/v1/places:autocomplete',json=body,headers={'X-Goog-Api-Key':GOOGLE_PLACES_KEY,'X-Goog-FieldMask':'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text'})
        response.raise_for_status()
        predictions=[item.get('placePrediction',{}) for item in response.json().get('suggestions',[]) if item.get('placePrediction',{}).get('placeId')][:6]
        async def details(prediction):
            place_id=prediction['placeId']
            detail=await client.get(f'https://places.googleapis.com/v1/places/{place_id}',params={'languageCode':'en','regionCode':(country or 'IN').lower()},headers={'X-Goog-Api-Key':GOOGLE_PLACES_KEY,'X-Goog-FieldMask':'id,displayName,formattedAddress,location'})
            detail.raise_for_status(); place=detail.json(); location=place.get('location',{})
            a,b=location.get('latitude'),location.get('longitude')
            if a is None or b is None: return None
            row={'id':f'google/{place_id}','name':place.get('displayName',{}).get('text') or prediction.get('text',{}).get('text',key),'address':place.get('formattedAddress',''),'lat':a,'lon':b}
            if lat is not None and lon is not None: row['distance_km']=distance(lat,lon,a,b)
            return row
        rows=[row for row in await asyncio.gather(*(details(prediction) for prediction in predictions)) if row]
    if lat is not None and lon is not None: rows.sort(key=lambda row:row.get('distance_km',999999))
    result={'suggestions':rows, 'source':'Google Places'}
    if len(suggestion_cache)>=256: suggestion_cache.pop(next(iter(suggestion_cache)))
    suggestion_cache[cache_key]=(time.monotonic(),result)
    return result


def distance(lat,lon,a,b):
    p1,p2=math.radians(lat),math.radians(a); dlat=math.radians(a-lat); dlon=math.radians(b-lon)
    return round(6371*2*math.asin(min(1,math.sqrt(math.sin(dlat/2)**2+math.cos(p1)*math.cos(p2)*math.sin(dlon/2)**2))),2)


hospital_cache={}

def today_hours(current, regular):
    today=datetime.now(ZoneInfo('Asia/Kolkata')).strftime('%A').lower()
    for hours in (current,regular):
        for description in hours.get('weekdayDescriptions',[]):
            if description.split(':',1)[0].strip().lower()==today:
                return description.split(':',1)[1].strip() if ':' in description else description
    return None

def google_rows(payload,lat,lon):
    rows=[]
    summaries=payload.get('routingSummaries',[])
    for index,place in enumerate(payload.get('places',[])):
        location=place.get('location',{}); a,b=location.get('latitude'),location.get('longitude')
        if a is None or b is None or not place.get('displayName',{}).get('text'): continue
        current=place.get('currentOpeningHours') or {}; regular=place.get('regularOpeningHours') or {}
        name=place['displayName']['text']; types=place.get('types',[])
        facility_type=place.get('googleMapsTypeLabel',{}).get('text') or place.get('primaryTypeDisplayName',{}).get('text') or 'Hospital'
        ownership_text=f'{name} {facility_type}'
        public_name=bool(re.search(r'\b(government|govt\.?|municipal|district hospital|primary health cent(?:re|er)|community health cent(?:re|er)|urban health cent(?:re|er))\b|\bcorporation\s+(hospital|maternity|clinic|medical)',ownership_text,re.I))
        ownership='public' if public_name or any(value in types for value in ['government_office','local_government_office']) else 'private'
        summary=summaries[index] if index<len(summaries) else {}
        leg=(summary.get('legs') or [{}])[0]
        meters=leg.get('distanceMeters')
        duration=leg.get('duration','')
        seconds=int(duration[:-1]) if re.fullmatch(r'\d+s',duration) else None
        rows.append({'id':f"google/{place.get('id','')}",'name':place['displayName']['text'],'lat':a,'lon':b,
          'distance_km':round(meters/1000,1) if isinstance(meters,(int,float)) else None,
          'travel_minutes':max(1,round(seconds/60)) if seconds is not None else None,
          'directions_uri':summary.get('directionsUri'),'address':place.get('formattedAddress',''),
          'phone':place.get('nationalPhoneNumber'),'ownership':ownership,'emergency':False,
          'facility_type':facility_type,
          'place_types':types,
          'open_now':current.get('openNow',regular.get('openNow')),
          'today_hours':today_hours(current,regular),
          'opening_hours':current.get('weekdayDescriptions') or regular.get('weekdayDescriptions',[]),
          'business_status':place.get('businessStatus'),'rating':place.get('rating'),
          'rating_count':place.get('userRatingCount'),'maps_uri':place.get('googleMapsUri')})
    return sorted(rows,key=lambda row:row['distance_km'] if row['distance_km'] is not None else float('inf'))

async def google_hospitals(client,lat,lon,radius):
    fields='places.id,places.displayName,places.formattedAddress,places.location,places.types,places.primaryType,places.primaryTypeDisplayName,places.googleMapsTypeLabel,places.businessStatus,places.currentOpeningHours,places.regularOpeningHours,places.nationalPhoneNumber,places.rating,places.userRatingCount,places.googleMapsUri,routingSummaries'
    async def search(query,count):
        response=await client.post('https://places.googleapis.com/v1/places:searchText',json={
          'textQuery':query,'maxResultCount':count,
          'locationBias':{'circle':{'center':{'latitude':lat,'longitude':lon},'radius':radius}},
          'routingParameters':{'origin':{'latitude':lat,'longitude':lon},'travelMode':'DRIVE'}},
          headers={'X-Goog-Api-Key':GOOGLE_PLACES_KEY,'X-Goog-FieldMask':fields},timeout=20)
        response.raise_for_status()
        return google_rows(response.json(),lat,lon)
    general,government=await asyncio.gather(search('hospitals and clinics',20),search('government hospitals',10))
    by_id={row['id']:row for row in general if re.search(r'hospital|clinic|medical cent(?:re|er)|nursing home',row['facility_type'],re.I)}
    for row in government:
        if row['ownership']=='public' and re.search(r'hospital|clinic|medical cent(?:re|er)',row['facility_type'],re.I):
            by_id.setdefault(row['id'],row)
    return sorted(by_id.values(),key=lambda row:row['distance_km'] if row['distance_km'] is not None else float('inf'))

async def hospitals(lat=None,lon=None,city=None,radius=10000,country=None):
    cache_key=(lat,lon,city,radius,country)
    cached=hospital_cache.get(cache_key)
    if cached and time.monotonic()-cached[0]<300: return cached[1]
    async with httpx.AsyncClient(timeout=22,headers={'User-Agent':'MediappDevelopment/1.0 (local hospital lookup)'}) as client:
        if city:
            places=(await suggestions(city,country))['suggestions']
            if not places: return {'hospitals':[],'lat':None,'lon':None}
            lat,lon=places[0]['lat'],places[0]['lon']
        if lat is None or lon is None or not -90<=lat<=90 or not -180<=lon<=180: raise ValueError('Location required')
        if not GOOGLE_PLACES_KEY: raise RuntimeError('Google Places is not configured')
        results=await google_hospitals(client,lat,lon,radius)
    result={'hospitals':results,'lat':lat,'lon':lon,'source':'Google Places'}
    if len(hospital_cache)>=128: hospital_cache.pop(next(iter(hospital_cache)))
    hospital_cache[cache_key]=(time.monotonic(),result)
    return result
