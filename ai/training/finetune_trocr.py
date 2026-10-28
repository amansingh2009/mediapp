"""Fine-tune pretrained TrOCR on the published RxHandBD word crops.

This is an OCR experiment, not a clinical prescription decoder. The published
test split is evaluated only after validation has selected the checkpoint.
"""

import argparse
import hashlib
import json
import random
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import torch
from PIL import Image
from rapidfuzz.distance import Levenshtein
from torch.utils.data import DataLoader, Dataset
from transformers import TrOCRProcessor, VisionEncoderDecoderModel


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "model_registry/trocr-small-handwritten-pretrained"
SPLITS = ROOT / "data/processed/rxhandbd/splits.json"


class Words(Dataset):
    def __init__(self, records):
        self.records = records

    def __len__(self):
        return len(self.records)

    def __getitem__(self, index):
        row = self.records[index]
        original = Path(row["path"])
        image_path = ROOT / "data/processed/rxhandbd" / original.parent.name / original.name
        with Image.open(image_path) as image:
            return image.convert("RGB"), row["text"]


def metrics(model, processor, loader, device):
    model.eval()
    total_edits = total_chars = exact = count = 0
    examples = []
    with torch.inference_mode():
        for images, references in loader:
            pixels = processor(images=list(images), return_tensors="pt").pixel_values.to(device)
            generated = model.generate(pixels, max_new_tokens=24, num_beams=1)
            predictions = processor.batch_decode(generated, skip_special_tokens=True)
            for reference, prediction in zip(references, predictions):
                prediction = " ".join(prediction.lower().strip().split())
                total_edits += Levenshtein.distance(reference, prediction)
                total_chars += len(reference)
                exact += prediction == reference
                count += 1
                if len(examples) < 12:
                    examples.append({"reference": reference, "prediction": prediction})
    return {"samples": count, "cer": total_edits / max(1, total_chars),
            "exact_match": exact / max(1, count), "examples": examples}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=ROOT / "model_registry/trocr-rxhandbd-v1")
    parser.add_argument("--epochs", type=int, default=8)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--learning-rate", type=float, default=5e-5)
    parser.add_argument("--patience", type=int, default=3)
    parser.add_argument("--smoke", action="store_true", help="Train/evaluate a tiny subset without touching the main output")
    args = parser.parse_args()
    if args.smoke and args.output == ROOT / "model_registry/trocr-rxhandbd-v1":
        args.output = ROOT / "model_registry/trocr-smoke"
    args.output.mkdir(parents=True, exist_ok=True)

    random.seed(73)
    np.random.seed(73)
    torch.manual_seed(73)
    torch.set_num_threads(4)
    device = torch.device("mps" if torch.backends.mps.is_available() else "cpu")
    records = json.loads(SPLITS.read_text())
    hashes = {key: {item["digest"] for item in records[key]} for key in ("train", "validation", "test")}
    assert not hashes["train"] & hashes["validation"]
    assert not hashes["train"] & hashes["test"]
    assert not hashes["validation"] & hashes["test"]
    train_rows = records["train"][:64] if args.smoke else records["train"]
    validation_rows = records["validation"][:32] if args.smoke else records["validation"]
    loader = lambda rows, shuffle=False: DataLoader(
        Words(rows), batch_size=args.batch_size, shuffle=shuffle,
        collate_fn=lambda batch: ([item[0] for item in batch], [item[1] for item in batch]),
        generator=torch.Generator().manual_seed(73))
    train_loader = loader(train_rows, True)
    validation_loader = loader(validation_rows)

    processor = TrOCRProcessor.from_pretrained(SOURCE)
    model = VisionEncoderDecoderModel.from_pretrained(SOURCE).to(device)
    model.config.pad_token_id = processor.tokenizer.pad_token_id
    model.config.decoder_start_token_id = model.generation_config.decoder_start_token_id
    model.config.vocab_size = model.config.decoder.vocab_size
    model.generation_config.pad_token_id = processor.tokenizer.pad_token_id
    model.generation_config.eos_token_id = processor.tokenizer.eos_token_id
    baseline = metrics(model, processor, validation_loader, device)

    report = {
        "status": "TRAINING", "started_at": datetime.now(timezone.utc).isoformat(),
        "source_model": "microsoft/trocr-small-handwritten",
        "source_revision": "b4648cfa171985a6745f37ddd637e98c0da958ac",
        "source_sha256": hashlib.sha256((SOURCE / "pytorch_model.bin").read_bytes()).hexdigest(),
        "dataset": "RxHandBD", "dataset_url": "https://zenodo.org/records/18478741",
        "dataset_md5": "c096859fcccb33655edaf34e4c1e7a06",
        "split_sizes": {key: len(value) for key, value in records.items()},
        "training_samples": len(train_rows), "validation_samples": len(validation_rows),
        "seed": 73, "device": str(device), "learning_rate": args.learning_rate,
        "batch_size": args.batch_size, "baseline_validation": baseline,
        "history": [], "selected_epoch": 0, "best_validation_cer": baseline["cer"],
        "clinical_validation": False, "deployed": False,
    }
    status_path = args.output / "status.json"
    def persist():
        status_path.write_text(json.dumps(report, indent=2))
    persist()
    print(json.dumps({"baseline_validation": baseline, "device": str(device)}), flush=True)

    optimizer = torch.optim.AdamW(model.parameters(), lr=args.learning_rate, weight_decay=0.01)
    best = baseline["cer"]
    stale = 0
    for epoch in range(1, args.epochs + 1):
        model.train()
        losses = []
        started = time.monotonic()
        for images, labels in train_loader:
            pixels = processor(images=images, return_tensors="pt").pixel_values.to(device)
            token_ids = processor.tokenizer(labels, padding=True, truncation=True,
                                            max_length=32, return_tensors="pt").input_ids
            token_ids[token_ids == processor.tokenizer.pad_token_id] = -100
            loss = model(pixel_values=pixels, labels=token_ids.to(device)).loss
            if not torch.isfinite(loss):
                raise RuntimeError("Non-finite training loss")
            optimizer.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            losses.append(loss.item())
        measured = metrics(model, processor, validation_loader, device)
        row = {"epoch": epoch, "training_loss": sum(losses) / len(losses),
               "validation_cer": measured["cer"],
               "validation_exact_match": measured["exact_match"],
               "seconds": round(time.monotonic() - started, 1)}
        report["history"].append(row)
        if measured["cer"] < best:
            best = measured["cer"]
            stale = 0
            report["selected_epoch"] = epoch
            report["best_validation_cer"] = best
            model.save_pretrained(args.output / "best", safe_serialization=True)
            processor.save_pretrained(args.output / "best")
        else:
            stale += 1
        persist()
        print(json.dumps(row), flush=True)
        if stale >= args.patience:
            break

    if report["selected_epoch"]:
        selected = VisionEncoderDecoderModel.from_pretrained(args.output / "best").to(device)
        selected.config.pad_token_id = processor.tokenizer.pad_token_id
        selected.config.decoder_start_token_id = selected.generation_config.decoder_start_token_id
        selected.generation_config.pad_token_id = processor.tokenizer.pad_token_id
        selected.generation_config.eos_token_id = processor.tokenizer.eos_token_id
    else:
        selected = VisionEncoderDecoderModel.from_pretrained(SOURCE).to(device)
    if not args.smoke:
        report["test"] = metrics(selected, processor, loader(records["test"]), device)
    report["status"] = "COMPLETED_EXPERIMENTAL"
    report["completed_at"] = datetime.now(timezone.utc).isoformat()
    report["limitations"] = [
        "Word crops only; full-page extraction is not measured by this benchmark",
        "Writer and patient IDs are absent; writer-independent accuracy is unknown",
        "The source test split was evaluated in prior local experiments",
        "No clinical validation; decoded medication must be confirmed by a clinician",
    ]
    persist()
    print(json.dumps({"status": report["status"], "selected_epoch": report["selected_epoch"],
                      "test": report.get("test")}), flush=True)


if __name__ == "__main__":
    main()
