# Indian prescription model candidate

Candidate: [KushagraWadhwa/medical-prescription-ocr-india](https://huggingface.co/KushagraWadhwa/medical-prescription-ocr-india), pinned to Git revision `7d894f8ad93cc1461413979748dc26dfacf882d2`.

The published repository is 7.52 GB and labels its license Apache-2.0. Its configuration declares `Qwen2_5_VLForConditionalGeneration`, `qwen2_5_vl`, float16 weights, and Transformers 5.0.0. The card says it was fine-tuned from Qwen2.5-VL-3B with QLoRA, but the published files contain a complete `model.safetensors`, not a separate LoRA adapter file. The card reports 1,969 training and 246 validation images from `naazimsnh02/medocr-vision-dataset`, qualitative examples, and no numerical medicine or dose accuracy. It advises qualified clinical review.

The current computer is an Apple M5 MacBook Air with 16 GB unified memory. Its existing PyTorch build can access MPS outside the command sandbox, but the 7.52 GB float16 weights plus visual inputs and generation cache may exceed comfortable memory. Latency and peak memory are unmeasured. The model must remain an optional candidate until a real inference run and independent benchmark pass. A dedicated NVIDIA GPU environment with sufficient VRAM is the safer deployment option if local memory or latency fails; no paid cloud service has been configured.

`ai/inference/indian_qwen.py` loads only a local, pinned copy with `trust_remote_code=False` and validates JSON without inventing missing fields. `ai/inference/download_indian_qwen.py` requires an explicit large-download flag. The existing FastAPI reader remains the active model until the candidate is measured on verified full-prescription labels. Model output is never proof of the original prescription text.
