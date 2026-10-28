"""Compare readers on the same fixed, labeled local pages.

These pages are synthetic smoke fixtures, not a clinical accuracy benchmark.
"""

import argparse
import importlib.util
import json
from pathlib import Path
import sys
import time

from PIL import Image

from metrics import score_case, transcription_errors


ROOT = Path(__file__).resolve().parents[2]
LABELS = Path(__file__).resolve().parents[1] / "datasets/evaluation/synthetic.json"
FIXTURES = ROOT / "backend/tests/fixtures/public-prescriptions"


def load_ocr(root):
    spec = importlib.util.spec_from_file_location("benchmark_ocr", root / "ocr.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--backend-root", type=Path, default=ROOT / "backend")
    parser.add_argument("--reader", choices=("ocr", "indian"), default="ocr")
    parser.add_argument("--model-dir", type=Path,
                        default=ROOT / "ai/model_registry/indian-qwen-v1")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    if args.reader == "ocr":
        reader = load_ocr(args.backend_root.resolve()).decode
    else:
        sys.path.insert(0, str(ROOT / "ai"))
        from inference.indian_qwen import IndianPrescriptionReader
        reader = IndianPrescriptionReader(args.model_dir.resolve()).decode
    labels = json.loads(LABELS.read_text())
    results = []
    for case in labels["cases"]:
        started = time.perf_counter()
        with Image.open(FIXTURES / case["image"]) as image:
            response = reader(image)
        actual = [
            {
                "name": row.get("name") or row.get("drug_name", ""),
                "strength": row.get("strength", ""),
                "instruction": row.get("instruction") or row.get("instructions", ""),
            }
            for row in response["medicines"]
        ]
        score = score_case(case["medicines"], actual)
        text_score = transcription_errors(case.get("transcription"), response.get("raw_text"))
        results.append({"image": case["image"], "seconds": round(time.perf_counter() - started, 3),
                        **score, **text_score})
    expected = sum(row["expected"] for row in results)
    matched = sum(row["name_matches"] for row in results)
    report = {
        "dataset": labels["purpose"],
        "reader": args.reader,
        "backend": str(args.backend_root.resolve()),
        "documents": len(results),
        "expected_medicines": expected,
        "exact_name_matches": matched,
        "name_precision": matched / sum(row["predicted"] for row in results)
                          if any(row["predicted"] for row in results) else None,
        "name_recall": matched / expected if expected else None,
        "name_f1": 2 * matched / (expected + sum(row["predicted"] for row in results))
                   if expected or any(row["predicted"] for row in results) else None,
        "results": results,
    }
    rendered = json.dumps(report, indent=2)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered + "\n")
    print(rendered)


if __name__ == "__main__":
    main()
