# MediDecode — Backend API Service

FastAPI-powered medical intelligence and prescription decoding service. It provides multi-modal prescription image transcription via **Google Gemini Vision**, clinical monographs from OpenFDA and NHS Digital, Indian generic medicine matching, and geolocation-based healthcare facility search.

---

## 1. Overview & Architecture

The backend operates as an asynchronous, stateless microservice communicating with the React Native / Expo mobile application over HTTP/REST on port `8102`.

```
                    ┌─────────────────────────┐
                    │  React Native / Mobile  │
                    └────────────┬────────────┘
                                 │ HTTP (multipart / JSON)
                                 ▼
                    ┌─────────────────────────┐
                    │      FastAPI Gateway    │
                    │   (Port 8102 / CORS)    │
                    └──────┬───────────┬──────┘
                           │           │
            Image Ingestion│           │Clinical Lookups
                           ▼           ▼
        ┌─────────────────────┐     ┌──────────────────────┐
        │ Google Gemini Vision│     │ OpenFDA / NHS Digital│
        │ gemini-3-flash      │     │ & Curated Catalog    │
        └─────────────────────┘     └──────────────────────┘
```

### Key Technologies
* **Framework:** FastAPI `0.115+` (ASGI on Uvicorn)
* **Python Runtime:** Python `3.10+` (compatible up to Python `3.14`)
* **AI Vision Engine:** Google Gemini Multi-Modal Vision API (`gemini-3-flash-preview` / `gemini-3.5-flash`)
* **Fallback Engine:** Local PaddleOCR (PP-OCRv5-en)
* **Image Processing:** Pillow (PIL) with decompression bomb protection
* **Data Sources:** OpenFDA Drug Labels API, NHS Digital Monographs, Indian Generic Pharmacopoeia (PMBJP Jan Aushadhi & Indian Brand Catalog)
* **Location Engine:** Google Places API (New) & OpenStreetMap IP Geocoding
* **Authentication & Sync:** Supabase Auth JWT validation

---

## 2. API Endpoints Reference

| Method | Endpoint | Description | Auth |
| :--- | :--- | :--- | :--- |
| `GET` | `/health` | Reports service status, active AI decoder, and configuration flags | Public |
| `POST` | `/v1/decode` | Uploads prescription photo (`<10MB`), extracts structured medications | Optional JWT / Local |
| `GET` | `/v1/medicine-information` | Returns clinical uses, composition, common/serious effects & precautions | Optional JWT / Local |
| `GET` | `/v1/medicine-matches` | Searches catalog for brand matches, generic salt equivalents & scores | Optional JWT / Local |
| `GET` | `/v1/hospitals` | Discovers nearby hospitals, clinics, distances, and public/private status | Optional JWT / Local |
| `GET` | `/v1/ip-location` | Resolves approximate client latitude/longitude from client IP | Optional JWT / Local |

---

## 3. Environment Configuration (`.env`)

Create or update `.env` in the `backend/` directory:

```bash
cp .env.example .env
```

```env
# -------------------------------------------------------------
# Google Gemini Vision Configuration (Primary Prescription OCR)
# -------------------------------------------------------------
GEMINI_API_KEY=your_google_gemini_api_key_from_ai_studio
GEMINI_MODEL=gemini-3-flash-preview
GEMINI_FALLBACK_MODEL=gemini-3.5-flash

# -------------------------------------------------------------
# Supabase Configuration (Optional: for encrypted cloud backup)
# -------------------------------------------------------------
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key

# -------------------------------------------------------------
# Google Places API (Optional: for nearby hospital discovery)
# -------------------------------------------------------------
GOOGLE_PLACES_API_KEY=your_google_places_api_key

# -------------------------------------------------------------
# Server Security & Environment
# -------------------------------------------------------------
APP_ENV=development
CORS_ORIGINS=http://127.0.0.1:8100,http://localhost:8100,http://172.16.148.205:8100
```

---

## 4. Setup & Running Locally

### Step 1: Create Virtual Environment
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
```

### Step 2: Install Dependencies
```bash
pip install -r requirements.txt
```

### Step 3: Run the Server
```bash
python run.py
```
*The service listens on `http://0.0.0.0:8102`.*

### Step 4: Verify Health
```bash
curl -s http://127.0.0.1:8102/health | jq
```
Expected output:
```json
{
  "status": "ok",
  "model_available": true,
  "checkpoint": "ppocrv5-en",
  "experimental": true,
  "supabase_configured": true,
  "google_places_configured": true,
  "google_gemini_configured": true,
  "active_decoder": "gemini",
  "active_decoder_model": "gemini-3-flash-preview"
}
```

---

## 5. Automated Tests

Run backend tests using pytest:

```bash
# Run API & reference lookup tests
source .venv/bin/activate
pytest test_backend.py -v
```

---

## 6. Safety & Non-Fabrication Architecture

1. **Strict JSON Schema Enforcement**: Google Gemini is invoked using structured response schema schemas (`RESPONSE_SCHEMA`). The model cannot invent conversational filler or unsolicited medical diagnoses.
2. **Zero Hallucination Constraint**: Inscriptions that are illegible or ambiguous are flagged with `review_required: true` rather than guessed.
3. **Rate Limiting & DoS Protection**: Clients are throttled to a maximum of 40 requests/minute per IP / user token. Image sizes are strictly capped at 10 MB and 20 Megapixels.
