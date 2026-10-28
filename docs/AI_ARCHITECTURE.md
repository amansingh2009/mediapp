# Prescription recognition architecture

The Expo app captures a photo, previews it, and sends it as multipart `file` to FastAPI `POST /v1/decode`. The API validates the image, limits uploads to 10 MB and 20 megapixels, and runs one OCR request at a time. The active reader is PP-OCRv5 through RapidOCR with local ONNX weights. It rotates according to EXIF, scales large pages without overwriting the original, groups nearby OCR fragments into rows, and extracts review-only medicine candidates from numbered or clearly labeled lines. It returns the original OCR reading and never fills absent doses from a drug catalog.

The mobile app stores prescription profiles, photos, medicines, and reminders locally, then syncs user-scoped records to Supabase when configured. An uncertain OCR card can be retried only when no reviewed medicine or active reminder would be replaced. Reminder validation requires review, a dose, frequency, duration, and a fixed schedule. Time edits remain within two hours of the original schedule.

`ai/inference/indian_qwen.py` is an optional, pinned research reader. It has not been downloaded or run. `ai/inference/reconcile.py` preserves PaddleOCR and vision-model candidates separately; different document segmentation makes positional auto-matching unsafe. A future backend integration must add source regions, measured uncertainty, and a verified selection before any model output can be promoted to a reminder. The active API contract remains unchanged.

The active path accepts JPG/PNG and other images supported by Pillow. PDF input, skew correction, background jobs, and multi-page handling are **not implemented**. Adding them requires separate tests and request-time limits; they must not be implied by the current `/v1/decode` endpoint.
