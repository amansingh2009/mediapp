"""Fetch only the reviewed RxHandBD archive and verify its source metadata."""

import argparse
import hashlib
import json
from pathlib import Path

import httpx


ROOT = Path(__file__).resolve().parents[2]
MANIFEST = json.loads((ROOT / "datasets/manifest.json").read_text())
SOURCE = next(row for row in MANIFEST["sources"] if row["id"] == "rxhandbd")
TARGET = ROOT / "data/raw/rxhandbd/RxHandBD.zip"


def md5(path):
    digest = hashlib.md5()
    with path.open("rb") as handle:
        while chunk := handle.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--allow-download", action="store_true")
    args = parser.parse_args()
    if TARGET.exists() and md5(TARGET) == SOURCE["md5"]:
        print(f"Verified existing archive: {TARGET}")
        return
    if not args.allow_download:
        parser.error("Archive missing or checksum mismatch; pass --allow-download after reviewing the source")
    with httpx.Client(timeout=45, follow_redirects=True) as client:
        record = client.get(SOURCE["record_api"])
        record.raise_for_status()
        metadata = record.json()
    if metadata["metadata"].get("license", {}).get("id") != "mit-license":
        raise ValueError("Published license differs from reviewed MIT metadata")
    source = next(row for row in metadata["files"] if row["key"] == SOURCE["archive"])
    if source["checksum"] != f"md5:{SOURCE['md5']}":
        raise ValueError("Published checksum changed")
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    partial = TARGET.with_suffix(".zip.part")
    with httpx.stream("GET", source["links"]["self"], timeout=180, follow_redirects=True) as response, partial.open("wb") as output:
        response.raise_for_status()
        for chunk in response.iter_bytes(1024 * 1024):
            output.write(chunk)
    if partial.stat().st_size != source["size"] or md5(partial) != SOURCE["md5"]:
        raise ValueError("Downloaded archive failed size or checksum verification")
    partial.replace(TARGET)
    print(f"Verified download: {TARGET}")


if __name__ == "__main__":
    main()
