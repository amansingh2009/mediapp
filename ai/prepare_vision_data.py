"""Download and verify the public handwriting corpus and pretrained TrOCR model."""

import csv
import hashlib
import json
import random
import zipfile
from pathlib import Path

import httpx
from huggingface_hub import snapshot_download


ROOT = Path(__file__).resolve().parent
RECORD = "https://zenodo.org/api/records/18478741"
ARCHIVE_MD5 = "c096859fcccb33655edaf34e4c1e7a06"
MODEL = "microsoft/trocr-small-handwritten"
REVISION = "b4648cfa171985a6745f37ddd637e98c0da958ac"


def md5(path):
    digest = hashlib.md5()
    with path.open("rb") as source:
        while chunk := source.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def prepare():
    raw = ROOT / "data/raw/rxhandbd"
    processed = ROOT / "data/processed/rxhandbd"
    raw.mkdir(parents=True, exist_ok=True)
    processed.mkdir(parents=True, exist_ok=True)
    with httpx.Client(timeout=45, follow_redirects=True) as client:
        response = client.get(RECORD)
        response.raise_for_status()
        record = response.json()
    if record["metadata"].get("license", {}).get("id") != "mit-license":
        raise ValueError("Dataset license differs from reviewed MIT metadata")
    source = next(file for file in record["files"] if file["key"] == "RxHandBD.zip")
    if source["checksum"] != f"md5:{ARCHIVE_MD5}":
        raise ValueError("Published archive checksum changed")
    archive = raw / "RxHandBD.zip"
    if not archive.exists() or md5(archive) != ARCHIVE_MD5:
        temporary = raw / "RxHandBD.zip.part"
        with httpx.stream("GET", source["links"]["self"], timeout=180,
                          follow_redirects=True) as response, temporary.open("wb") as target:
            response.raise_for_status()
            for chunk in response.iter_bytes(1024 * 1024):
                target.write(chunk)
        if temporary.stat().st_size != source["size"] or md5(temporary) != ARCHIVE_MD5:
            raise ValueError("Dataset download failed verification")
        temporary.replace(archive)
    with zipfile.ZipFile(archive) as zipped:
        for member in zipped.infolist():
            target = (processed / member.filename).resolve()
            if not target.is_relative_to(processed.resolve()):
                raise ValueError("Unsafe archive path")
            if not target.exists():
                zipped.extract(member, processed)
    records = {}
    for split, label_file, image_dir in (
        ("train", "Train_Label.csv", "Train_Set"),
        ("test", "Test_Labels.csv", "Test_Set"),
    ):
        rows = []
        with (processed / label_file).open(encoding="utf-8-sig") as stream:
            for item in csv.DictReader(stream):
                image = processed / image_dir / item["Images"]
                text = " ".join(item["Text"].strip().lower().split())
                if text and image.is_file():
                    rows.append({"path": str(image), "text": text,
                                 "digest": hashlib.sha256(image.read_bytes()).hexdigest()})
        records[split] = rows
    test_hashes = {item["digest"] for item in records["test"]}
    groups = {}
    for item in records["train"]:
        if item["digest"] not in test_hashes:
            groups.setdefault(item["digest"], []).append(item)
    keys = sorted(groups)
    random.Random(42).shuffle(keys)
    validation_count = max(1, int(len(keys) * .15))
    records["validation"] = [item for key in keys[:validation_count] for item in groups[key]]
    records["train"] = [item for key in keys[validation_count:] for item in groups[key]]
    (processed / "splits.json").write_text(json.dumps(records, indent=2))
    (raw / "record.json").write_text(json.dumps(record, indent=2))

    model_dir = ROOT / "model_registry/trocr-small-handwritten-pretrained"
    snapshot_download(MODEL, revision=REVISION, local_dir=model_dir,
                      allow_patterns=["README.md", "config.json", "generation_config.json",
                                      "preprocessor_config.json", "special_tokens_map.json",
                                      "tokenizer_config.json", "sentencepiece.bpe.model",
                                      "pytorch_model.bin"])
    print(json.dumps({"dataset": "RxHandBD", "license": "MIT",
                      "archive_md5": ARCHIVE_MD5, "splits": {key: len(value) for key, value in records.items()},
                      "pretrained_model": MODEL, "revision": REVISION}))


if __name__ == "__main__":
    prepare()
