"""Local full-page prescription OCR. Every result requires human review."""

import os
import re
import threading
import logging
from difflib import SequenceMatcher
from pathlib import Path

import numpy as np
from PIL import ImageEnhance, ImageFilter, ImageOps


ROOT = Path(__file__).resolve().parent
configured_model_dir = Path(os.getenv("PPOCR_CHECKPOINT", "models/ppocrv5-en")).expanduser()
MODEL_DIR = configured_model_dir if configured_model_dir.is_absolute() else ROOT / configured_model_dir
MODEL_FILES = (MODEL_DIR / "detection.onnx", MODEL_DIR / "recognition.onnx")
_reader = None
_lock = threading.Lock()
logger = logging.getLogger("uvicorn.error")

STRENGTH = re.compile(r"\b\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|iu|%)\b", re.I)
FREQUENCY = re.compile(r"\b(?:once daily|once a day|twice daily|twice a day|three times daily|three times a day|four times daily|four times a day|at bedtime|bedtime|as needed|OD|QD|BD|BID|TDS|TID|QID|HS|PRN|SOS)\b|\b(?:OD|BD|TDS|SOS)(?:e[xk]?[i1l]y)\b|\b[01]-[01]-[01]\b", re.I)
DOSE = re.compile(r"\b(?:\d+(?:\.\d+)?|1/2|half|one|two)\s*(?:tablets?|tabs?|t\.?|capsules?|caps?\.?|puffs?|drops?|teaspoons?|ml)\b", re.I)
DURATION = re.compile(r"\b(?:for|x)?\s*(\d+)\s*(days?|weeks?|months?)\b", re.I)
FORM = re.compile(r"^\s*(?:Tab(?:let)?|Cap(?:sule)?|Syrup|Syp|Inj(?:ection)?|Drops?)\.?\s+", re.I)
MARKER = re.compile(r"[①-⑳]|(?<![\w/])[1-9]\d?\s*[).](?!\d)")
NUMBERED = re.compile(r"^\s*(?:\(?[1-9]\d?\s*\)|[1-9]\d?\s*[).]|[①-⑳])\s*", re.I)
PREFIX = re.compile(r"^\s*(?:\(?\d{1,2}\s*\)|\d{1,2}\s*[).]|[①-⑳]|[-•]|Rx\b|Tab(?:let)?\.?\s|Cap(?:sule)?\.?\s|Syrup\s|Syp\.?\s|Inj(?:ection)?\.?\s|Drops?\s)\s*", re.I)
HEADER = re.compile(r"^(?:dr\.?|doctor|patient|name\s*:|age|sex|date|address|diagnosis|advice|signature|follow|clinic|hospital|demo care|rx\s*$|review|blood|diet|exercise|investigation|test\b)", re.I)
INSTRUCTION = re.compile(r"\b(?:before|after|with)\s+(?:food|meals?|breakfast|lunch|dinner)\b|\bat night\b", re.I)


def parse_line(text, handwriting="", printed=""):
    explicit_form = bool(FORM.match(text))
    numbered = bool(NUMBERED.match(text))
    clean = PREFIX.sub("", text).strip()
    # Common handwriting OCR substitutions in otherwise explicit shorthand.
    clean = re.sub(r"\b(\d+(?:\.\d+)?)\s*tg\b", r"\1 tab", clean, flags=re.I)
    clean = re.sub(r"\b(\d+)\s*(?:dey|duy|dy)\b", r"\1 days", clean, flags=re.I)
    clean = re.sub(r"^[\s/:).\-]+", "", clean)
    clean = re.sub(r"^(?:(?:s/e|cbcn)\s*[:.)/]?\s*|cqc\s*[:.)]?\s*n?\.?\s*)+", "", clean, flags=re.I)
    if HEADER.match(clean):
        return None
    strength = STRENGTH.search(clean)
    if strength and strength.group().lower().endswith("g") and re.search(r"\b\d+(?:\.\d+)?\s*g\s*(?:[x×]\s*)?\d+\s*(?:days?|weeks?)\b", clean, re.I):
        # In this common handwriting pattern the OCR reads a dose mark as "1g";
        # do not mislabel it as a 1-gram medicine strength.
        strength = None
    frequency = FREQUENCY.search(clean)
    dose = DOSE.search(clean)
    duration = DURATION.search(clean)
    # A clear medicine-form prefix may create an unreviewed candidate even
    # when dosage is unreadable. The app cannot schedule an incomplete result.
    if not (strength or frequency or dose or explicit_form or numbered):
        return None
    stops = [match.start() for match in (strength, frequency, dose, duration) if match]
    name = clean[:min(stops)].strip(" ,;:-") if stops else clean
    if numbered and not (strength or frequency or dose or explicit_form):
        name = name.split(":", 1)[0].strip(" ,;:-")
    if not re.search("[A-Za-z]", name) or len(name) > (60 if numbered else 100):
        return None
    if numbered and len(name.split()) > 6:
        return None
    instruction = INSTRUCTION.search(clean)
    frequency_text = frequency.group() if frequency else ""
    if re.fullmatch(r"(?:OD|BD|TDS|SOS)(?:e[xk]?[i1l]y)", frequency_text, re.I):
        frequency_text = re.match(r"OD|BD|TDS|SOS", frequency_text, re.I).group()
    frequency_text = _plain_frequency(frequency_text)
    return {
        "name": name,
        "strength": strength.group() if strength else "",
        "dosage": dose.group() if dose else "",
        "frequency": frequency_text,
        "duration_days": int(duration[1]) * (30 if duration[2].lower().startswith("month") else 7 if duration[2].lower().startswith("week") else 1) if duration else None,
        "instruction": instruction.group() if instruction else "",
        "original": text,
        "model": handwriting,
        "printed": printed,
    }


def _plain_frequency(value):
    key = re.sub(r"[.\s]+", " ", value).strip().lower()
    return {
        "od": "once daily", "qd": "once daily", "once a day": "once daily",
        "bd": "twice daily", "bid": "twice daily", "twice a day": "twice daily",
        "tds": "three times daily", "tid": "three times daily", "three times a day": "three times daily",
        "qid": "four times daily", "four times a day": "four times daily",
        "hs": "at bedtime", "bedtime": "at bedtime", "prn": "as needed", "sos": "as needed",
        "1-0-1": "morning and evening", "1-1-1": "morning, afternoon and evening",
        "0-0-1": "at night", "1-0-0": "in the morning", "0-1-0": "in the afternoon",
    }.get(key, value)


def page_reader():
    global _reader
    if _reader is None:
        from rapidocr import LangDet, LangRec, ModelType, OCRVersion, RapidOCR

        _reader = RapidOCR(params={
            "Det.ocr_version": OCRVersion.PPOCRV5,
            "Det.lang_type": LangDet.CH,
            "Det.model_type": ModelType.MOBILE,
            "Det.model_path": str(MODEL_FILES[0]),
            "Rec.ocr_version": OCRVersion.PPOCRV5,
            "Rec.lang_type": LangRec.EN,
            "Rec.model_type": ModelType.MOBILE,
            "Rec.model_path": str(MODEL_FILES[1]),
            "Global.use_cls": False,
        })
    return _reader


def reading_lines(result):
    """Join OCR fragments sharing a row, such as a circled number and drug name."""
    texts = [str(text).strip() for text in (result.txts or ())]
    boxes = result.boxes
    if boxes is None or len(boxes) != len(texts):
        return [text for text in texts if text]
    fragments = []
    for text, box in zip(texts, boxes):
        if not text:
            continue
        points = np.asarray(box, dtype=float)
        left, top = points.min(axis=0)
        right, bottom = points.max(axis=0)
        fragments.append((float(left), float(top), float(right), float(bottom), text))
    rows = []
    for fragment in sorted(fragments, key=lambda part: (part[1] + part[3]) / 2):
        left, top, right, bottom, _ = fragment
        center = (top + bottom) / 2
        height = max(bottom - top, 1)
        for row in rows:
            row_top = min(part[1] for part in row)
            row_bottom = max(part[3] for part in row)
            row_center = (row_top + row_bottom) / 2
            if abs(center - row_center) <= min(height, row_bottom - row_top) * 0.55:
                row.append(fragment)
                break
        else:
            rows.append([fragment])
    rows.sort(key=lambda row: min(part[1] for part in row))
    return [" ".join(part[4] for part in sorted(row, key=lambda part: part[0])) for row in rows]


def medicine_segments(line):
    """Split numbered prescriptions even when OCR joins them to earlier notes."""
    markers = list(MARKER.finditer(line))
    if not markers:
        return [line]
    pieces = [line[:markers[0].start()]] if markers[0].start() else []
    pieces.extend(line[marker.start():markers[index + 1].start() if index + 1 < len(markers) else None]
                  for index, marker in enumerate(markers))
    return [part.strip() for part in pieces if part.strip()]


def decode(image):
    if not all(path.is_file() for path in MODEL_FILES):
        raise FileNotFoundError("OCR model weights are unavailable")
    image = ImageOps.exif_transpose(image).convert("RGB")
    image.thumbnail((2400, 3200))
    with _lock:
        reader = page_reader()
        original = reader(np.asarray(image))
        # A contrast/sharpened pass can recover faint handwriting without changing the stored photo.
        grey = ImageOps.autocontrast(ImageOps.grayscale(image), cutoff=1)
        enhanced = ImageEnhance.Contrast(grey).enhance(1.25).filter(ImageFilter.UnsharpMask(radius=1.2, percent=140, threshold=3))
        enhanced_result = reader(np.asarray(enhanced.convert("RGB")))
        # Handwritten drug rows are a small part of a full-page form; a focused crop gives
        # the detector more pixels per letter and reduces interference from printed footer text.
        crop_top, crop_bottom = int(image.height * .30), int(image.height * .78)
        medication_crop = image.crop((0, crop_top, image.width, crop_bottom))
        medication_crop = medication_crop.resize((medication_crop.width * 2, medication_crop.height * 2))
        medication_crop = ImageOps.autocontrast(ImageOps.grayscale(medication_crop), cutoff=1)
        crop_result = reader(np.asarray(medication_crop.convert("RGB")))
    runs = []
    for result in (original, enhanced_result, crop_result):
        lines = reading_lines(result)
        medicines = [medicine for line in lines for part in medicine_segments(line)
                     if (medicine := parse_line(part, part, ""))]
        # Prefer the pass that found more distinct explicit medicine candidates.
        signatures = {re.sub(r"[^a-z0-9]", "", item["name"].lower()) for item in medicines}
        score = (len(signatures), sum(bool(item["strength"] or item["frequency"] or item["duration_days"]) for item in medicines))
        runs.append((score, result, lines, medicines))
    _, result, lines, _ = max(runs, key=lambda run: run[0])
    medicines = []
    for _, _, _, candidates in sorted(runs, key=lambda run: run[0], reverse=True):
        for candidate in candidates:
            normalized = re.sub(r"[^a-z0-9]", "", candidate["name"].lower())
            duplicate = next((existing for existing in medicines
                              if re.sub(r"[^a-z0-9]", "", existing["name"].lower()) == normalized
                              or (normalized and re.sub(r"[^a-z0-9]", "", existing["name"].lower())
                                  and SequenceMatcher(None, normalized, re.sub(r"[^a-z0-9]", "", existing["name"].lower())).ratio() >= .86)), None)
            if duplicate:
                for field in ("strength", "dosage", "frequency", "duration_days", "instruction"):
                    if not duplicate.get(field) and candidate.get(field): duplicate[field] = candidate[field]
            else:
                medicines.append(candidate)
    raw_lines = list(dict.fromkeys(line for _, _, pass_lines, _ in runs for line in pass_lines))
    if raw_lines: lines = raw_lines
    logger.info("Prescription OCR original_fragments=%d enhanced_fragments=%d crop_fragments=%d candidates=%d", len(original.txts or ()), len(enhanced_result.txts or ()), len(crop_result.txts or ()), len(medicines))
    doctor = next((line for line in lines if re.match(r"^Dr\.?\s", line, re.I)), "")
    hospital = next((line for line in lines if re.search(r"\b(?:hospital|clinic)\b", line, re.I)), "")
    return {
        "medicines": medicines[:40],
        "hospital": hospital[:150],
        "doctor": doctor[:100],
        "engine": "PP-OCRv5 page handwriting (experimental)",
        "review_required": True,
        "raw_text": "\n".join(lines),
        "model_words": len(lines),
    }
