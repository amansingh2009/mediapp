# Mediapp backend

FastAPI API for prescription OCR, medicine reference lookup, and nearby care.
It runs as a separate service from the Expo app in `../mobile`, while both
live under the same project root.

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python download_models.py
test -f .env || cp .env.example .env
# Fill in Supabase, optional Google Places, and optional Gemini values in .env.
.venv/bin/python run.py
```

The active PP-OCRv5 detector and recognizer live in `models/ppocrv5-en/`.
Their weights are pinned by checksum and ignored by Git. `GET /health` reports
whether both are present. The API listens on port 8102; the Expo app uses
`EXPO_PUBLIC_API_URL` or its local-development default. The model returns
unreviewed candidate medicines; it does not decide treatment or schedule
incomplete readings.

When `GEMINI_API_KEY` is configured, prescription images are sent to the
Google Gemini API for primary decoding. The server falls back to local PP-OCRv5
if Gemini is unavailable or returns no readable medicine rows. Create a key in
Google AI Studio and keep it server-side in this backend's `.env`; the Google
Maps/Places key is separate and should not be reused. `GET /health` reports
whether Gemini is configured and which decoder is active.

Supabase schema migrations belong to this backend in `supabase/migrations/`.
For local checks:

```sh
.venv/bin/python -m pytest test_backend.py -q
```
