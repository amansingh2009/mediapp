# MediScan AI research

Training scripts, public handwriting datasets, experiment reports, and
checkpoints live here. The Expo app and FastAPI backend are sibling folders
under the same MediScan project root. See [VISION_TRAINING.md](VISION_TRAINING.md) for the
training method, reproducibility steps, measured results, and limitations.

The backend serves its own lightweight PP-OCRv5 runtime weights from
`../backend/models/ppocrv5-en/`; it does not import this project. The pinned
Indian Qwen reader in `inference/` is a benchmark candidate until its large
weights are approved for download and independently evaluated. See the
[model assessment](../docs/MODEL_SELECTION.md) and
[benchmark report](../docs/BENCHMARK_RESULTS.md).
