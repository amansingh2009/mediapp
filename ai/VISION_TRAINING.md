# Pretrained prescription-handwriting experiment

This folder is the AI workspace beside the mobile app (`../mobile`) and API
(`../backend`). `training/finetune_trocr.py` fine-tunes Microsoft's pinned `trocr-small-handwritten`
vision encoder-decoder on [RxHandBD](https://zenodo.org/records/18478741),
an MIT-licensed collection of 5,578 cropped handwritten prescription words.
The dataset includes medicine names, brands, dosage forms, and instructions, so
no separate medicine-name list is substituted for image ground truth.

The downloaded model and image files are local artifacts ignored by Git. To
recreate them from this folder:

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements-training.txt
.venv/bin/python prepare_vision_data.py
.venv/bin/python training/finetune_trocr.py \
  --epochs 8 --batch-size 16 --learning-rate 0.00002 --patience 3
```

The downloader pins the model revision and verifies the dataset's published
checksum and MIT license. Images are split by SHA-256 digest; duplicate image
content cannot cross train, validation, and test. Validation chooses the best
checkpoint. The source test split is evaluated only after that selection.
Results, sample predictions, provenance, and limitations are written to
`model_registry/trocr-rxhandbd-v1/status.json`; the selected checkpoint is
in its `best/` folder.

This benchmark measures **word-crop transcription**, not correct medication,
strength, frequency, or duration extraction from a full-page prescription.
The dataset does not provide writer or patient IDs, so a writer-independent
score cannot be claimed. Training never uses user-uploaded prescriptions.
Keep human review mandatory; do not turn OCR text into a medication schedule
without confirmation of the original prescription.

## Current local result

The selected epoch 7 checkpoint was tested on 1,115 held-out RxHandBD word
images: character error rate 0.2635 and exact-word match 48.25%. The
pretrained model's validation character error rate was 0.5709; after training,
the selected checkpoint's validation rate was 0.1195. These scores are word
transcription only. They do not imply 48% prescription-level or clinical
accuracy.

The separate FastAPI backend prefers the published PP-OCRv5 mobile text
detector plus English recognizer, run through RapidOCR 3.10.0 and ONNX Runtime.
Unlike the Tesseract word-box pipeline, it detects handwritten lines directly
from a whole page. The two pinned models are stored in
`../backend/models/ppocrv5-en/` (SHA-256: detector
`4d97c44a20d30a81aad087d6a396b08f786c4635742afc391f6621f5c6ae78ae`,
recognizer `c3461add59bb4323ecba96a492ab75e06dda42467c9e3d0c18db5d1d21924be8`).
The fine-tuned TrOCR and older CRNN checkpoints remain here as research
artifacts. They are not runtime dependencies of the separate backend.

On three downloaded synthetic full-page test prescriptions, the earlier
pipeline found candidates in 2/3 and PP-OCRv5 found candidates in 3/3. It
correctly transcribed `Prednisone 25 mg` on the formerly empty result, though
some other names and instructions still contain letter errors. These samples
are only a regression check, not a clinical accuracy estimate. All decoded
medicines remain unreviewed; the app requires human confirmation and complete
prescription details before a reminder can be saved. No unreadable dose is
filled in automatically.
