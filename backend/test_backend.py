import io
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw, ImageFont

import main
import ocr
import reference
import gemini_decoder

client=TestClient(main.app)

def test_prescribed_fields_are_parsed_without_inventing_doses():
    row=ocr.parse_line('Tab. Paracetamol 500 mg 1 tablet twice daily for 3 days after food')
    assert row['name']=='Paracetamol' and row['dosage']=='1 tablet'
    assert row['duration_days']==3 and row['frequency']=='twice daily'
    absent=ocr.parse_line('Cetirizine 10 mg at bedtime')
    assert absent['dosage']=='' and absent['duration_days'] is None
    assert ocr.parse_line('Patient: Example 50 mg') is None
    assert ocr.parse_line('Dr. Sample') is None
    uncertain=ocr.parse_line('Tab. UnclearName')
    assert uncertain['name']=='UnclearName' and uncertain['dosage']==''

def test_numbered_handwriting_fragments_create_reviewable_candidates():
    from types import SimpleNamespace
    fragments=SimpleNamespace(
        txts=['(1)', 'Vertin 16:', '1-0-1 x 10 days', '(2)', 'Unclearname:', 'at night'],
        boxes=[
            [[5,10],[25,10],[25,30],[5,30]],
            [[32,10],[130,10],[130,30],[32,30]],
            [[150,10],[300,10],[300,30],[150,30]],
            [[5,55],[25,55],[25,75],[5,75]],
            [[32,55],[145,55],[145,75],[32,75]],
            [[155,55],[230,55],[230,75],[155,75]],
        ],
    )
    lines=ocr.reading_lines(fragments)
    assert lines==['(1) Vertin 16: 1-0-1 x 10 days','(2) Unclearname: at night']
    first=ocr.parse_line(lines[0])
    assert first['name']=='Vertin 16' and first['frequency']=='morning and evening'
    assert first['duration_days']==10 and first['dosage']==''
    second=ocr.parse_line(lines[1])
    assert second['name']=='Unclearname' and second['dosage']==''
    assert ocr.parse_line('(3) Follow up in 7 days') is None

def test_decode_returns_numbered_candidates_when_ocr_separates_columns(monkeypatch):
    from types import SimpleNamespace
    result=SimpleNamespace(
        txts=['(1)', 'Vertin 16:', '1-0-1 x 10 days', '(2)', 'Unclearname:', 'at night'],
        boxes=[
            [[5,10],[25,10],[25,30],[5,30]],
            [[32,10],[130,10],[130,30],[32,30]],
            [[150,10],[300,10],[300,30],[150,30]],
            [[5,55],[25,55],[25,75],[5,75]],
            [[32,55],[145,55],[145,75],[32,75]],
            [[155,55],[230,55],[230,75],[155,75]],
        ],
    )
    monkeypatch.setattr(ocr, 'page_reader', lambda: lambda image: result)
    image=Image.new('RGB',(400,100),'white')
    data=ocr.decode(image)
    assert [item['name'] for item in data['medicines']]==['Vertin 16','Unclearname']
    assert data['review_required'] is True
    assert all(not item['dosage'] for item in data['medicines'])

def test_numbered_medicine_inside_ocr_row_is_not_lost():
    pieces=ocr.medicine_segments('Other note ① Verlin 16: 1tg x 10dey')
    assert pieces==['Other note','① Verlin 16: 1tg x 10dey']
    item=ocr.parse_line(pieces[1])
    assert item['name']=='Verlin 16' and item['dosage']=='1 tab' and item['duration_days']==10
    assert ocr.parse_line(ocr.medicine_segments('note 4 ) Neei5: 10days')[1])['name']=='Neei5'
    assert ocr.medicine_segments('③ Othermed. 4 : unclear instruction')==['③ Othermed. 4 : unclear instruction']

def test_gemini_keeps_dose_frequency_separate_and_expands_abbreviations():
    payload={'candidates':[{'content':{'parts':[{'text':json.dumps({
        'doctor':'','hospital':'','raw_text':'Vertin 16 mg 1 tablet TDS for 5 days',
        'medicines':[{'medicine_name':'Vertin','strength':'16 mg',
          'dose_per_administration':'1 tablet','how_often':'TDS',
          'duration':'5 days','timing_or_food_instruction':'after food',
          'original_handwritten_line':'Vertin 16 mg 1 tab TDS × 5 days'}]
    })}]}}]}
    row=gemini_decoder._decode_response(payload)['medicines'][0]
    assert row['dosage']=='1 tablet'
    assert row['frequency']=='three times daily'
    assert row['duration_days']==5
    assert row['instruction']=='after food'

@pytest.mark.parametrize(('source','expected'),[
    ('Cetirizine 10 mg 1 tab OD','once daily'),
    ('Cetirizine 10 mg 1 tab TDS','three times daily'),
    ('Cetirizine 10 mg 1 tab 1-0-1','morning and evening'),
])
def test_local_ocr_expands_frequency_labels(source,expected):
    assert ocr.parse_line(source)['frequency']==expected

def test_actual_model_and_printed_image_pipeline():
    image=Image.new('RGB',(1450,450),'white'); draw=ImageDraw.Draw(image)
    font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',36)
    draw.text((30,30),'Demo Clinic',font=font,fill='black')
    draw.text((30,115),'Paracetamol 500 mg 1 tablet twice daily for 3 days',font=font,fill='black')
    output=io.BytesIO(); image.save(output,format='PNG')
    response=client.post('/v1/decode',files={'file':('synthetic.png',output.getvalue(),'image/png')})
    assert response.status_code==200, response.text
    data=response.json(); assert data['review_required'] is True and data['model_words']>0
    assert 'PP-OCRv5' in data['engine']
    assert data['medicines'][0]['name']=='Paracetamol'
    assert data['medicines'][0]['dosage']=='1 tablet'

def test_trained_checkpoint_is_selected_and_review_remains_required():
    health=client.get('/health').json()
    assert health['model_available'] is True
    assert health['checkpoint']=='ppocrv5-en'
    assert health['experimental'] is True

def test_invalid_upload_is_rejected():
    assert client.post('/v1/decode',files={'file':('x.jpg',b'not an image','image/jpeg')}).status_code==422
    assert client.post('/v1/decode',files={'file':('x.jpg',b'x'*(main.LIMIT+1),'image/jpeg')}).status_code==413

def test_production_rejects_guest_before_processing(monkeypatch):
    monkeypatch.setattr(main,'PRODUCTION',True)
    assert client.get('/v1/medicine-information?q=acetaminophen').status_code==401

def test_bad_bearer_does_not_fall_back_to_guest():
    assert client.get('/v1/hospitals?city=Delhi',headers={'Authorization':'garbage'}).status_code in [401,503]

def test_hospital_validation_and_distance():
    assert client.get('/v1/hospitals?lat=999&lon=1').status_code==422
    assert client.get('/v1/hospitals').status_code==422
    assert reference.distance(0,0,0,0)==0
    assert 110<reference.distance(0,0,1,0)<112

def test_reference_missing_data_is_explicit(monkeypatch):
    async def absent(_): raise LookupError('No exact reference label found')
    monkeypatch.setattr(reference,'information',absent)
    assert client.get('/v1/medicine-information?q=unknown').status_code==404

def test_public_downloaded_samples_are_review_only(tmp_path):
    root=Path(__file__).resolve().parent/'tests/fixtures/public-prescriptions'
    manifest=json.loads((root/'sources.json').read_text()); assert manifest['training_use'] is False
    results=[]
    for path in sorted(root.glob('*.png')):
        response=client.post('/v1/decode',files={'file':(path.name,path.read_bytes(),'image/png')})
        assert response.status_code==200, response.text
        data=response.json(); assert data['review_required'] and data['model_words']>0
        assert data['medicines'], f'No medicine candidates found in {path.name}'
        assert all(not item['dosage'] for item in data['medicines'])
        results.append({'sample':path.name,'medicine_candidates':data['medicines'],'raw_text':data['raw_text'],'model_words':data['model_words']})
    (tmp_path/'ocr-results.json').write_text(json.dumps(results,indent=2))


def test_nhs_sections_keep_general_and_serious_categories_separate():
    from nhs_reference import effects
    result=effects('<main><h2>Common side effects</h2><p>Common example</p><h2>Serious side effects</h2><p>Serious example</p><h3>Serious allergic reaction</h3><p>Urgent example</p><h2>Other information</h2><p>Unrelated</p></main>')
    assert result['common_effects']=='Common example'
    assert result['serious_effects']=='Serious example\nUrgent example'
    assert 'Unrelated' not in str(result)
    assert effects('<main><h2>Side effects of example</h2><p>No category supplied</p></main>')=={'adverse_reactions':'No category supplied'}


def test_suggestions_minimum_length_and_unavailable_provider(monkeypatch):
    assert client.get('/v1/hospital-suggestions?q=ab').status_code==422
    async def failed(*_):
        import httpx
        raise httpx.ConnectError('offline')
    monkeypatch.setattr(reference,'suggestions',failed)
    assert client.get('/v1/hospital-suggestions?q=Delhi').status_code==503


def test_google_hospital_rows_use_driving_distance_and_visible_hours():
    from datetime import datetime
    from zoneinfo import ZoneInfo
    today=datetime.now(ZoneInfo('Asia/Kolkata')).strftime('%A')
    payload={'places':[
        {'id':'far','displayName':{'text':'Far Hospital'},'location':{'latitude':28.7,'longitude':77.2},'formattedAddress':'Far Road','primaryTypeDisplayName':{'text':'Hospital'}},
        {'id':'near','displayName':{'text':'Government Near Hospital'},'location':{'latitude':28.6005,'longitude':77.2005},'formattedAddress':'Near Road','types':['hospital','eye_care_center'],'primaryTypeDisplayName':{'text':'Hospital'},'googleMapsTypeLabel':{'text':'Eye care center'},'businessStatus':'OPERATIONAL','regularOpeningHours':{'weekdayDescriptions':[f'{today}: 9:00 AM – 6:00 PM']},'currentOpeningHours':{'openNow':True},'rating':4.4,'userRatingCount':87,'googleMapsUri':'https://maps.google.com/example'},
    ],'routingSummaries':[{'legs':[{'distanceMeters':3100,'duration':'420s'}]},{'legs':[{'distanceMeters':1800,'duration':'240s'}],'directionsUri':'https://google.com/maps/dir/example'}]}
    rows=reference.google_rows(payload,28.6,77.2)
    assert [row['name'] for row in rows]==['Government Near Hospital','Far Hospital']
    assert rows[0]['ownership']=='public'
    assert rows[1]['ownership']=='private'
    assert rows[0]['open_now'] is True
    assert rows[0]['today_hours']=='9:00 AM – 6:00 PM'
    assert rows[0]['distance_km']==1.8
    assert rows[0]['travel_minutes']==4
    assert rows[0]['directions_uri']=='https://google.com/maps/dir/example'
    assert rows[0]['facility_type']=='Eye care center'
