"""Rebuild deterministic, image-hash-separated local word-crop splits."""

import csv
import hashlib
import json
from pathlib import Path
import random


ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data/processed/rxhandbd"


def read_rows(label_file, image_dir):
    rows = []
    with (DATA / label_file).open(encoding="utf-8-sig") as handle:
        for item in csv.DictReader(handle):
            path = DATA / image_dir / item["Images"]
            label = " ".join(item["Text"].strip().lower().split())
            if path.is_file() and label:
                rows.append({"path": str(path), "text": label,
                             "digest": hashlib.sha256(path.read_bytes()).hexdigest()})
    return rows


def main():
    train = read_rows("Train_Label.csv", "Train_Set")
    test = read_rows("Test_Labels.csv", "Test_Set")
    test_hashes = {row["digest"] for row in test}
    groups = {}
    for row in train:
        if row["digest"] not in test_hashes:
            groups.setdefault(row["digest"], []).append(row)
    keys = sorted(groups)
    random.Random(42).shuffle(keys)
    validation_count = max(1, int(len(keys) * .15))
    result = {
        "train": [row for key in keys[validation_count:] for row in groups[key]],
        "validation": [row for key in keys[:validation_count] for row in groups[key]],
        "test": test,
    }
    (DATA / "splits.json").write_text(json.dumps(result, indent=2))
    print({key: len(value) for key, value in result.items()})
    print("Writer IDs are unavailable; writer-independent separation is not verified")


if __name__ == "__main__":
    main()
