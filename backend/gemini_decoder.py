"""Google Gemini vision decoder for handwritten prescription images.

The output remains an unverified reading. This module extracts visible text;
it must not invent medicine names or fill unreadable dosing instructions.
"""

import base64
import io
import json
import os
import re
import asyncio

import httpx
from PIL import Image, ImageOps


API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
MODEL = os.getenv("GEMINI_MODEL", "gemini-3-flash-preview").strip()
# Fallback model tried when the primary returns 503/429. Must also be a Gemini model.
FALLBACK_MODEL = os.getenv("GEMINI_FALLBACK_MODEL", "gemini-3.5-flash").strip()
ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

RESPONSE_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "medicines": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "medicine_name": {"type": "STRING"},
                    "strength": {"type": "STRING"},
                    "dose_per_administration": {"type": "STRING"},
                    "how_often": {"type": "STRING"},
                    "duration": {"type": "STRING"},
                    "timing_or_food_instruction": {"type": "STRING"},
                    "original_handwritten_line": {"type": "STRING"},
                },
                "required": [
                    "medicine_name", "strength", "dose_per_administration",
                    "how_often", "duration", "timing_or_food_instruction",
                    "original_handwritten_line",
                ],
            },
        },
        "doctor": {"type": "STRING"},
        "hospital": {"type": "STRING"},
        "raw_text": {"type": "STRING"},
    },
    "required": ["medicines", "doctor", "hospital", "raw_text"],
}

PROMPT = """You are an expert clinical pharmacist and medical transcription specialist.
Transcribe the handwritten prescription image into the exact JSON format provided with the highest medical fidelity.

CRITICAL MEDICAL ACCURACY RULES:
1. IDENTIFY ALL MEDICATIONS:
   - Carefully examine the whole document from top to bottom.
   - Prescriptions frequently use brand names, generics, or trade names (e.g., Augmentin, Paracetamol, Amoxicillin, Metformin, Pantocid, Azithromycin, Prednisone, Vertin).
   - Look for standard prescription prefixes like 'Tab', 'Cap', 'Syp', 'Inj', 'Oint', 'Rx', or numbered bullet points (1., 2., ①, ②).

2. SEPARATE STRENGTH VS DOSE PER ADMINISTRATION:
   - 'strength': The drug concentration or unit strength (e.g., "500 mg", "25 mg", "10 mg/5ml", "650 mg").
   - 'dose_per_administration': How much is taken in a single dose (e.g., "1 tablet", "2 capsules", "5 ml", "1 puff", "half tablet"). Do NOT confuse strength with dose per administration.

3. SCHEDULE & FREQUENCY:
   - Convert standard medical shorthand and Latin abbreviations into clear, plain-language frequency phrases:
     * OD / qd / 1-0-0 -> "once daily"
     * BD / BID / 1-0-1 -> "twice daily"
     * TDS / TID / 1-1-1 -> "three times daily"
     * QID / 1-1-1-1 -> "four times daily"
     * HS / 0-0-1 -> "at bedtime"
     * SOS / PRN -> "as needed"
     * Q4H / Q6H / Q8H -> "every 4 hours" / "every 6 hours" / "every 8 hours"
   - If frequency is written as an explicit timing or specific time of day, state it clearly.

4. TIMING & FOOD INSTRUCTIONS:
   - Explicitly note food relations: "before food" (AC), "after food" (PC), "with food", "on an empty stomach", "at night".

5. DURATION:
   - Extract the full duration if stated (e.g., "5 days", "10 days", "1 month", "2 weeks").

6. DO NOT FABRICATE:
   - Transcribe what is actually written or legible.
   - If handwriting for a specific field (like duration or dose) is illegible or omitted, leave that field as an empty string ("").
   - Always retain the complete original handwritten text segment for each medicine in 'original_handwritten_line'.

7. CLINICAL DETAILS:
   - Transcribe the doctor's name (e.g., "Dr. C. Rossi") and clinic/hospital name if visible.
   - In 'raw_text', provide a complete, clean verbatim reading of all prescription lines.
"""


def _duration_days(value):
    match = re.search(r"\b(\d+)\s*(days?|weeks?|months?)\b", value, re.I)
    if not match:
        return None
    count = int(match.group(1))
    unit = match.group(2).lower()
    return count * (7 if unit.startswith("week") else 30 if unit.startswith("month") else 1)


def _text(value):
    return value.strip() if isinstance(value, str) else ""


def _frequency(value):
    value = _text(value)
    key = re.sub(r"[.\s]+", " ", value).strip().lower()
    aliases = {
        "od": "once daily", "qd": "once daily", "once a day": "once daily",
        "bd": "twice daily", "bid": "twice daily", "twice a day": "twice daily",
        "tds": "three times daily", "tid": "three times daily", "three times a day": "three times daily",
        "qid": "four times daily", "four times a day": "four times daily",
        "hs": "at bedtime", "bedtime": "at bedtime",
        "prn": "as needed", "sos": "as needed",
        "1-0-1": "morning and evening", "1-1-1": "morning, afternoon and evening",
        "0-0-1": "at night", "1-0-0": "in the morning", "0-1-0": "in the afternoon",
    }
    return aliases.get(key, value)


def _decode_response(payload):
    candidates = payload.get("candidates") or []
    if not candidates:
        raise ValueError("Gemini returned no response candidate")
    parts = candidates[0].get("content", {}).get("parts", [])
    raw = "".join(part.get("text", "") for part in parts if isinstance(part, dict))
    if not raw:
        raise ValueError("Gemini returned an empty response")
    print(f"\n[GEMINI RAW RESPONSE ({len(raw)} chars)]:\n{raw}\n")
    data = json.loads(raw)
    rows = []
    for item in data.get("medicines", [])[:40]:
        if not isinstance(item, dict):
            continue
        name = _text(item.get("medicine_name"))
        if not name:
            continue
        original = _text(item.get("original_handwritten_line"))
        duration = _text(item.get("duration"))
        rows.append({
            "name": name,
            "strength": _text(item.get("strength")),
            "dosage": _text(item.get("dose_per_administration")),
            "instruction": _text(item.get("timing_or_food_instruction")),
            "frequency": _frequency(item.get("how_often")),
            "duration_days": _duration_days(duration),
            "original": original or name,
            "model": MODEL,
            "printed": "",
        })
    print(f"\n[GEMINI DECODED MEDICINES ({len(rows)})]:")
    for r in rows:
        print(f"  • {r['name']} | Strength: '{r['strength']}' | Dose: '{r['dosage']}' | Freq: '{r['frequency']}' | Duration: '{r['duration_days']}' | Instruction: '{r['instruction']}'")
    print()
    return {
        "medicines": rows,
        "hospital": _text(data.get("hospital"))[:150],
        "doctor": _text(data.get("doctor"))[:100],
        "engine": f"Google Gemini {MODEL} vision (experimental)",
        "review_required": True,
        "raw_text": _text(data.get("raw_text"))[:20000],
        "model_words": len(_text(data.get("raw_text")).split()),
    }


async def decode(image: Image.Image):
    if not API_KEY:
        raise RuntimeError("Gemini API key is not configured")
    image = ImageOps.exif_transpose(image).convert("RGB")
    image.thumbnail((2400, 3200))
    page = io.BytesIO()
    image.save(page, format="JPEG", quality=92, optimize=True)
    images = [page.getvalue()]
    # Keep the whole page for context and add enlarged overlapping strips so
    # small medicine lines are less likely to disappear in a tall image.
    if image.height >= 1.25 * image.width and image.height >= 1400:
        overlap = int(image.height * 0.12)
        middle = image.height // 2
        for top, bottom in ((0, middle + overlap), (middle - overlap, image.height)):
            strip = image.crop((0, top, image.width, bottom))
            strip.thumbnail((2000, 1800))
            part = io.BytesIO()
            strip.save(part, format="JPEG", quality=94, optimize=True)
            images.append(part.getvalue())
    parts = []
    for index, content in enumerate(images):
        if index:
            parts.append({"text": f"Enlarged overlapping page section {index}; use it to read small handwriting and avoid counting a row twice."})
        parts.append({"inline_data": {"mime_type": "image/jpeg", "data": base64.b64encode(content).decode("ascii")}})
    parts.append({"text": "Transcribe the page into the requested JSON schema. Include every distinct medicine row."})
    request = {
        "systemInstruction": {"parts": [{"text": PROMPT}]},
        "contents": [{"parts": parts}],
        "generationConfig": {
            "temperature": 0,
            "maxOutputTokens": 8192,
            "responseMimeType": "application/json",
            "responseSchema": RESPONSE_SCHEMA,
        },
    }
    # Keep the interactive scan responsive; the API route falls back to local
    # OCR when this deadline expires.  Retry on transient 503/429 errors and,
    # when a fallback model is configured, try it before giving up entirely.
    models_to_try = [MODEL]
    if FALLBACK_MODEL and FALLBACK_MODEL != MODEL:
        models_to_try.append(FALLBACK_MODEL)
    last_error: Exception | None = None
    async with httpx.AsyncClient(timeout=httpx.Timeout(90.0, connect=10.0)) as client:
        for model_attempt, current_model in enumerate(models_to_try):
            for retry in range(2):
                try:
                    response = await client.post(
                        ENDPOINT.format(model=current_model),
                        headers={"x-goog-api-key": API_KEY},
                        json=request,
                    )
                    if response.status_code in (429, 503) and retry == 0:
                        # Brief back-off before the single retry attempt.
                        await asyncio.sleep(2.0)
                        continue
                    response.raise_for_status()
                    last_error = None
                    break
                except (httpx.ConnectError, httpx.TimeoutException) as exc:
                    last_error = exc
                    if retry:
                        break
                    await asyncio.sleep(1.0)
                except httpx.HTTPStatusError as exc:
                    last_error = exc
                    if exc.response.status_code not in (429, 503) or retry:
                        break
                    await asyncio.sleep(2.0)
            else:
                continue  # inner loop exhausted — try next model
            if last_error is None:
                break  # successful response
        else:
            # All model attempts failed.
            if last_error is not None:
                raise last_error
    if last_error is not None:
        raise last_error
    result = _decode_response(response.json())
    # Stamp whichever model ultimately responded so the frontend can show it.
    active_model = current_model  # noqa: F821 – set in loop above
    for row in result["medicines"]:
        row["model"] = active_model
    result["engine"] = f"Google Gemini {active_model} vision (experimental)"
    if not result["medicines"]:
        raise ValueError("Gemini did not find a readable medicine row")
    return result
