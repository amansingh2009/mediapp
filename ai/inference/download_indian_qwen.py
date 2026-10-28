"""Download only the reviewed revision, after explicit large-download approval."""

import argparse
from pathlib import Path

from huggingface_hub import snapshot_download

from indian_qwen import MODEL_ID, MODEL_DIR, REVISION


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--confirm-7-52-gb-download", action="store_true")
    args = parser.parse_args()
    if not args.confirm_7_52_gb_download:
        parser.error("The model repository is 7.52 GB; pass --confirm-7-52-gb-download after approval")
    Path(MODEL_DIR).mkdir(parents=True, exist_ok=True)
    snapshot_download(
        repo_id=MODEL_ID,
        revision=REVISION,
        local_dir=MODEL_DIR,
        allow_patterns=["*.json", "*.jinja", "*.safetensors", "*.model"],
    )
    print(f"Downloaded {MODEL_ID}@{REVISION} to {MODEL_DIR}")


if __name__ == "__main__":
    main()
