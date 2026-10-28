# Prescription data

The usable local research corpus is RxHandBD word crops in `../data/processed/rxhandbd/`. The three synthetic full-page fixtures in `../../backend/tests/fixtures/public-prescriptions/` are reserved for smoke tests. Neither collection is an independent clinical benchmark for real Indian prescriptions.

From `ai/`, run `python datasets/scripts/validate.py` to check local files and split leakage. `download.py --allow-download` fetches only the reviewed RxHandBD archive if missing. `preprocess.py` extracts it safely, then `split.py` rebuilds the local train/validation/test manifest. No user-uploaded photo is used by these scripts.

The independent Indian [EkaCare validation set](https://huggingface.co/datasets/ekacare/medical_records_parsing_validation_set) requires Hugging Face login and acceptance of its access conditions. Its 288 images are test-only; the scripts do not bypass that gate. A [1,000-image Bangladesh dataset](https://data.mendeley.com/datasets/tg2hm7n2bs/2) is a possible external generalization check after image-level privacy and label review. Neither is currently part of the local benchmark.
