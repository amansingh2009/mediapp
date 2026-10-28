"""Download the pinned PP-OCRv5 runtime weights and verify their hashes."""

import hashlib
from pathlib import Path

import httpx


ROOT = Path(__file__).resolve().parent
DESTINATION = ROOT / "models/ppocrv5-en"
BASE = "https://www.modelscope.cn/models/RapidAI/RapidOCR/resolve/v3.10.0/onnx/PP-OCRv5"
MODELS = {
    "detection.onnx": (
        f"{BASE}/det/ch_PP-OCRv5_det_mobile.onnx",
        "4d97c44a20d30a81aad087d6a396b08f786c4635742afc391f6621f5c6ae78ae",
    ),
    "recognition.onnx": (
        f"{BASE}/rec/en_PP-OCRv5_rec_mobile.onnx",
        "c3461add59bb4323ecba96a492ab75e06dda42467c9e3d0c18db5d1d21924be8",
    ),
}


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        while chunk := source.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def main():
    DESTINATION.mkdir(parents=True, exist_ok=True)
    for name, (url, expected) in MODELS.items():
        target = DESTINATION / name
        if target.is_file() and sha256(target) == expected:
            print(f"Verified {name}")
            continue
        temporary = target.with_suffix(".onnx.part")
        try:
            with httpx.stream("GET", url, timeout=120, follow_redirects=True) as response, temporary.open("wb") as output:
                response.raise_for_status()
                for chunk in response.iter_bytes(1024 * 1024):
                    output.write(chunk)
            if sha256(temporary) != expected:
                raise ValueError(f"Checksum mismatch for {name}")
            temporary.replace(target)
            print(f"Downloaded and verified {name}")
        finally:
            temporary.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
