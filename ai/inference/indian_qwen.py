"""Optional Indian prescription model candidate; never enables reminders itself."""

import json
from pathlib import Path
import time

from PIL import Image, ImageOps


MODEL_ID = "KushagraWadhwa/medical-prescription-ocr-india"
REVISION = "7d894f8ad93cc1461413979748dc26dfacf882d2"
MODEL_DIR = Path(__file__).resolve().parents[1] / "model_registry/indian-qwen-v1"
SYSTEM_PROMPT = (
    "Transcribe only information visible in this prescription. Return JSON only. "
    "Never infer or fill a missing medicine, strength, dose, frequency, or duration. "
    "For unreadable text use an empty string. Use this schema: "
    '{"doctor_name":"","clinic_name":"","medications":['
    '{"drug_name":"","strength":"","dosage":"","frequency":"",'
    '"duration":"","instructions":""}]}.'
)
FIELDS = ("drug_name", "strength", "dosage", "frequency", "duration", "instructions")


def parse_response(text):
    """Reject malformed output rather than salvaging plausible-looking fragments."""
    clean = text.strip()
    if clean.startswith("```json") and clean.endswith("```"):
        clean = clean[7:-3].strip()
    data = json.loads(clean)
    if not isinstance(data, dict) or not isinstance(data.get("medications"), list):
        raise ValueError("Model output is not a prescription JSON object")
    medicines = []
    for item in data["medications"][:40]:
        if not isinstance(item, dict):
            raise ValueError("Model medication entry is invalid")
        row = {key: str(item.get(key) or "").strip() for key in FIELDS}
        if any(len(value) > 250 for value in row.values()):
            raise ValueError("Model medication field is too long")
        if row["drug_name"]:
            medicines.append({**row, "source_model": MODEL_ID, "verified": False,
                              "source_region": None, "confidence": None})
    return {
        "doctor": str(data.get("doctor_name") or "").strip()[:100],
        "hospital": str(data.get("clinic_name") or "").strip()[:150],
        "medicines": medicines,
        "review_required": True,
    }


class IndianPrescriptionReader:
    def __init__(self, model_dir=MODEL_DIR):
        self.model_dir = Path(model_dir)
        if not (self.model_dir / "model.safetensors").is_file():
            raise FileNotFoundError("Pinned Indian prescription model has not been downloaded")
        import torch
        from transformers import AutoProcessor, Qwen2_5_VLForConditionalGeneration

        self.torch = torch
        self.processor = AutoProcessor.from_pretrained(
            self.model_dir, local_files_only=True, trust_remote_code=False)
        self.model = Qwen2_5_VLForConditionalGeneration.from_pretrained(
            self.model_dir, dtype=torch.float16, device_map="auto",
            local_files_only=True, trust_remote_code=False).eval()

    def decode(self, image):
        image = ImageOps.exif_transpose(image).convert("RGB")
        image.thumbnail((2400, 3200))
        messages = [
            {"role": "system", "content": [{"type": "text", "text": SYSTEM_PROMPT}]},
            {"role": "user", "content": [
                {"type": "image", "image": image},
                {"type": "text", "text": "Read this prescription and return the JSON schema."},
            ]},
        ]
        started = time.perf_counter()
        inputs = self.processor.apply_chat_template(
            messages, tokenize=True, add_generation_prompt=True,
            return_dict=True, return_tensors="pt").to(self.model.device)
        with self.torch.inference_mode():
            output = self.model.generate(**inputs, max_new_tokens=512, do_sample=False)
        generated = output[:, inputs["input_ids"].shape[1]:]
        text = self.processor.batch_decode(generated, skip_special_tokens=True)[0]
        return {**parse_response(text), "inference_seconds": round(time.perf_counter() - started, 3)}


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("image", type=Path)
    parser.add_argument("--model-dir", type=Path, default=MODEL_DIR)
    args = parser.parse_args()
    with Image.open(args.image) as image:
        print(json.dumps(IndianPrescriptionReader(args.model_dir).decode(image), indent=2))
