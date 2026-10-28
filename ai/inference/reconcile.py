"""Preserve competing prescription readings without silently choosing a drug.

OCR and a vision model may segment the page differently. Row positions therefore
do not prove that two candidates describe the same prescribed medicine.
"""


def reconcile(ocr_result: dict, vision_result: dict) -> dict:
    ocr_rows = ocr_result.get("medicines", [])
    vision_rows = vision_result.get("medicines", [])
    if not isinstance(ocr_rows, list) or not isinstance(vision_rows, list):
        raise ValueError("Both readers must supply medicine lists")
    candidates = []
    for source, rows, field in (
        ("paddleocr", ocr_rows, "name"),
        ("indian_qwen", vision_rows, "drug_name"),
    ):
        for index, row in enumerate(rows):
            if not isinstance(row, dict):
                raise ValueError("Invalid medicine candidate")
            name = row.get(field, "")
            if not isinstance(name, str) or not name.strip():
                continue
            candidates.append({
                "source": source,
                "source_index": index,
                "name": name.strip(),
                "fields": row,
                "verified": False,
            })
    return {
        "candidates": candidates,
        "ocr_raw_text": ocr_result.get("raw_text", ""),
        "review_required": True,
        "selection": None,
        "reason": "Reader outputs are independent; align with source regions and verify against the prescription before selecting.",
    }
