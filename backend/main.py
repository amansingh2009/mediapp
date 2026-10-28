import asyncio
import io
import logging
import os
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager

import httpx
from fastapi import Depends, FastAPI, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, UnidentifiedImageError
from starlette.concurrency import run_in_threadpool

import ocr
import gemini_decoder
import reference

SUPABASE_URL=os.getenv('SUPABASE_URL','').rstrip('/')
SUPABASE_KEY=os.getenv('SUPABASE_PUBLISHABLE_KEY','')
PRODUCTION=os.getenv('APP_ENV')=='production'
Image.MAX_IMAGE_PIXELS=20_000_000
LIMIT=10*1024*1024
gate=asyncio.Semaphore(1)
requests=defaultdict(deque)
logger=logging.getLogger('uvicorn.error')

@asynccontextmanager
async def lifespan(app):
    if PRODUCTION and not (SUPABASE_URL and SUPABASE_KEY): raise RuntimeError('Production requires Supabase auth configuration')
    yield

app=FastAPI(title='Mediapp API',version='1.0.0',lifespan=lifespan)
app.add_middleware(CORSMiddleware,allow_origins=os.getenv('CORS_ORIGINS','http://127.0.0.1:8100,http://localhost:8100,http://127.0.0.1:8101').split(','),allow_methods=['GET','POST'],allow_headers=['Authorization','Content-Type'])

async def identity(request:Request):
    bearer=request.headers.get('authorization','')
    if bearer:
        if not (SUPABASE_URL and SUPABASE_KEY): raise HTTPException(503,'Authentication is not configured')
        if not bearer.startswith('Bearer '): raise HTTPException(401,'Invalid session')
        async with httpx.AsyncClient(timeout=10) as client:
            result=await client.get(f'{SUPABASE_URL}/auth/v1/user',headers={'Authorization':bearer,'apikey':SUPABASE_KEY})
        if result.status_code!=200 or not result.json().get('id'): raise HTTPException(401,'Invalid or expired session')
        owner=result.json()['id']
    else:
        if PRODUCTION: raise HTTPException(401,'Sign in to continue')
        owner=f"local:{request.client.host if request.client else 'unknown'}"
    now=time.monotonic(); recent=requests[owner]
    while recent and recent[0]<now-60: recent.popleft()
    if len(recent)>=40: raise HTTPException(429,'Try again in a minute')
    recent.append(now)
    if len(requests)>5000:
        for key in list(requests):
            if not requests[key] or requests[key][-1]<now-120: requests.pop(key,None)
    return owner

@app.get('/health')
async def health():
    return {'status':'ok','model_available':all(path.is_file() for path in ocr.MODEL_FILES),'checkpoint':ocr.MODEL_DIR.name,'experimental':True,'supabase_configured':bool(SUPABASE_URL and SUPABASE_KEY),'google_places_configured':bool(reference.GOOGLE_PLACES_KEY),'google_gemini_configured':bool(gemini_decoder.API_KEY),'active_decoder':'gemini' if gemini_decoder.API_KEY else 'ppocr','active_decoder_model':gemini_decoder.MODEL if gemini_decoder.API_KEY else ocr.MODEL_DIR.name}

@app.post('/v1/decode',dependencies=[Depends(identity)])
async def decode(file:UploadFile):
    try:
        payload=await file.read(LIMIT+1)
        if len(payload)>LIMIT: raise HTTPException(413,'Photo exceeds 10 MB')
        image=Image.open(io.BytesIO(payload)); image.load()
        if image.width*image.height>20_000_000: raise HTTPException(413,'Photo dimensions too large')
        async with gate:
            if gemini_decoder.API_KEY:
                try:
                    result=await gemini_decoder.decode(image)
                    logger.info('Prescription decoded with Google Gemini model=%s medicines=%d',gemini_decoder.MODEL,len(result['medicines']))
                    return result
                except Exception as error:
                    logger.error('Google Gemini decode error: %s', error, exc_info=True)
                    raise HTTPException(502, f'Gemini transcription failed: {error}')
            raise HTTPException(503, 'Gemini API is not configured')
    except (UnidentifiedImageError,OSError,Image.DecompressionBombError,Image.DecompressionBombWarning): raise HTTPException(422,'Use a valid image')
    except FileNotFoundError: raise HTTPException(503,'Handwriting model is unavailable')
    except RuntimeError: raise HTTPException(503,'Unable to read image; try a clearer photo')
    finally: await file.close()

@app.get('/v1/medicine-information',dependencies=[Depends(identity)])
async def medicine_information(q:str=Query(min_length=2,max_length=100)):
    try: return await reference.information(q)
    except ValueError as error: raise HTTPException(422,str(error))
    except LookupError as error: raise HTTPException(404,str(error))
    except httpx.HTTPError: raise HTTPException(503,'Medicine reference is temporarily unavailable')

@app.get('/v1/medicine-matches',dependencies=[Depends(identity)])
async def medicine_matches(q:str=Query(min_length=2,max_length=100)):
    try: return await reference.medicine_matches(q)
    except ValueError as error: raise HTTPException(422,str(error))

@app.get('/v1/hospitals',dependencies=[Depends(identity)])
async def hospitals(lat:float|None=Query(default=None,ge=-90,le=90),lon:float|None=Query(default=None,ge=-180,le=180),city:str|None=Query(default=None,min_length=2,max_length=100),radius:int=Query(default=10000,ge=1000,le=30000),country:str|None=Query(default=None,min_length=2,max_length=2)):
    try: return await reference.hospitals(lat,lon,city,radius,country)
    except ValueError as error: raise HTTPException(422,str(error))
    except (httpx.HTTPError,RuntimeError): raise HTTPException(503,'Google Places search is temporarily unavailable')

@app.get('/v1/ip-location',dependencies=[Depends(identity)])
async def ip_location(request:Request):
    try: return await reference.ip_location(request.client.host if request.client else None)
    except (LookupError,httpx.HTTPError): raise HTTPException(503,'Approximate location is temporarily unavailable')

@app.get('/v1/hospital-suggestions',dependencies=[Depends(identity)])
async def hospital_suggestions(q:str=Query(min_length=3,max_length=100),country:str|None=Query(default=None,min_length=2,max_length=2),lat:float|None=Query(default=None,ge=-90,le=90),lon:float|None=Query(default=None,ge=-180,le=180)):
    try: return await reference.suggestions(q,country,lat,lon)
    except (httpx.HTTPError,RuntimeError): raise HTTPException(503,'Google Places suggestions are temporarily unavailable')
