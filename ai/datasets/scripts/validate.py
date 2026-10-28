"""Check local source integrity and image leakage across training splits."""

import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data/processed/rxhandbd"
FIXTURES = ROOT.parent / "backend/tests/fixtures/public-prescriptions"


def main():
    splits = json.loads((DATA / "splits.json").read_text())
    sets = {}
    for name, rows in splits.items():
        hashes = set()
        for row in rows:
            path = Path(row["path"])
            if not path.is_file() or not path.resolve().is_relative_to(DATA.resolve()):
                raise ValueError(f"Missing or non-local image in {name}: {path}")
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            if digest != row["digest"]:
                raise ValueError(f"Image checksum mismatch: {path}")
            hashes.add(digest)
        sets[name] = hashes
    for left in sets:
        for right in sets:
            if left < right and sets[left] & sets[right]:
                raise ValueError(f"Image leakage between {left} and {right}")
    fixture_manifest = json.loads((FIXTURES / "sources.json").read_text())
    if fixture_manifest["training_use"] is not False:
        raise ValueError("Synthetic fixtures must stay outside training")
    for row in fixture_manifest["files"]:
        if hashlib.sha256((FIXTURES / row["file"]).read_bytes()).hexdigest() != row["sha256"]:
            raise ValueError(f"Synthetic fixture checksum mismatch: {row['file']}")
    print("Verified word images, disjoint image hashes, and synthetic fixture checksums")
    print({name: len(rows) for name, rows in splits.items()})


if __name__ == "__main__":
    main()
