"""Public synthetic prescriptions, never added to model training."""
import hashlib
import json
import urllib.request
import ssl
import certifi
from pathlib import Path

root=Path(__file__).resolve().parent / 'tests/fixtures/public-prescriptions'
root.mkdir(parents=True,exist_ok=True)
base='https://huggingface.co/datasets/chinmays18/medical-prescription-dataset/resolve/main/test'
manifest=[]
for number in ['00006','00025','00027']:
    for folder,extension in [('images','png'),('annotations','json')]:
        name=f'prescription_{number}.{extension}'; url=f'{base}/{folder}/{name}'
        with urllib.request.urlopen(url,timeout=30,context=ssl.create_default_context(cafile=certifi.where())) as response: payload=response.read()
        (root / name).write_bytes(payload)
        manifest.append({'file':name,'url':url,'sha256':hashlib.sha256(payload).hexdigest()})
(root/'sources.json').write_text(json.dumps({'source':'chinmays18/medical-prescription-dataset','type':'synthetic prescription test split','purpose':'OCR and UI testing only; doses are synthetic and are not treatment recommendations','license_reference':'https://github.com/JonSnow1807/Medical-Prescription-OCR/blob/main/LICENSE','training_use':False,'files':manifest},indent=2))
print(f'Downloaded {len(manifest)//2} public synthetic prescription fixtures to {root}')
