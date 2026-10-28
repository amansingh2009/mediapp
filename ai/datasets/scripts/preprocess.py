"""Extract RxHandBD without permitting paths outside the dataset directory."""

from pathlib import Path
import zipfile


ROOT = Path(__file__).resolve().parents[2]
ARCHIVE = ROOT / "data/raw/rxhandbd/RxHandBD.zip"
DEST = ROOT / "data/processed/rxhandbd"


def main():
    if not ARCHIVE.is_file():
        raise FileNotFoundError("Run datasets/scripts/download.py first")
    DEST.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(ARCHIVE) as source:
        for item in source.infolist():
            target = (DEST / item.filename).resolve()
            if not target.is_relative_to(DEST.resolve()):
                raise ValueError(f"Unsafe archive path: {item.filename}")
            if not target.exists():
                source.extract(item, DEST)
    print(f"Extracted verified archive into {DEST}")


if __name__ == "__main__":
    main()
