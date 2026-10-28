# AI integration audit — 27 October 2026

## Actual application

- `mobile/` is an Expo SDK 58, React Native 0.88, TypeScript app using Expo Router. It is not a Next.js app. `src/app/(tabs)/scan.tsx` selects a camera/gallery image, `src/lib/api.ts` uploads it, `src/state/store.ts` saves a prescription profile, and `src/app/prescription/[id].tsx` renders the result. The existing reminder and hospital screens use the same local store.
- `backend/` is FastAPI. `POST /v1/decode` accepts a multipart `file`, validates a decoded image up to 10 MB and 20 million pixels, then runs `ocr.decode` with a request semaphore. `GET /health`, `/v1/medicine-information`, `/v1/hospitals`, `/v1/hospital-suggestions`, and `/v1/ip-location` are separate existing endpoints.
- `backend/ocr.py` loads local PP-OCRv5 English ONNX detection/recognition models through RapidOCR, extracts text fragments, and applies a per-fragment regex parser. It reports `review_required: true`; the backend does not activate reminders.
- `ai/` contains RxHandBD word-crop training experiments and checkpoints, including a fine-tuned TrOCR research checkpoint. It is not the model used by the API. The reported 48.25% exact-word score does not measure complete prescriptions or medicine instructions.

## Authentication and data

- The mobile app uses Supabase Auth through `src/lib/supabase.ts` when configured, with secure session storage on native devices. `src/state/store.ts` is offline-first and synchronizes a private `medication_backups` row and prescription photos in the private `prescriptions` Storage bucket. Its schema is in `backend/supabase/migrations/20261025173639_mediapp_private_backup.sql`, with user-scoped RLS policies. The API validates bearer tokens through Supabase Auth; development allows a local guest identity, production requires a session.
- The mobile API base is `EXPO_PUBLIC_API_URL` or local port 8102. The mobile project keeps its Supabase publishable key only; the backend holds its own configuration. No service-role key is required by the current code.
- There is no checked-in CI pipeline or deployment configuration in the consolidated project. The app and API have local commands and tests, but deployment hardware for a large vision model is not specified.

## Existing decode contract

`POST /v1/decode` returns `medicines`, `hospital`, `doctor`, `engine`, and `review_required`; it also returns `raw_text` and `model_words` for diagnostics. Each medicine has `name`, `strength`, `dosage`, `frequency`, `duration_days`, `instruction`, `original`, `model`, and `printed`. New evidence or uncertainty fields must be additive so stored data and mobile screens keep working.

## Reproduced design gap behind zero medicines

The page OCR detects fragments, but the original `parse_line` only accepted a fragment when it contained a recognized strength, dose, frequency, or form prefix. Numbered handwritten medicine names with instructions in separate fragments were discarded. The user's saved prescription initially showed zero cards. After joining OCR fragments by image row and detecting numbered entries within a row, a live retry produced three unverified name candidates. Their spellings and omitted regimen fields are still unreliable; no clinician-verified transcription of that image is available.

## Compatibility and safety risks

1. The consolidated `mediscan/` source is a copy of the earlier sibling projects. Ports 8100 and 8102 now serve this copy, so the old siblings remain a rollback option. Its local development data uses the existing browser origin and must not be reset during model experiments.
2. A model that guesses a plausible drug can be more dangerous than an empty result. Uncertain names and missing instructions need explicit review, with no automatic reminder from unverified fields.
3. The proposed Qwen2.5-VL Indian prescription model is a 7.52 GB repository, and its card gives qualitative results but no numerical medicine-field accuracy. Its listed training data contains unrelated receipt and document images in the public viewer, so an independent real-prescription benchmark is essential.
4. Current public full-page fixtures are synthetic. They are useful for regression tests but do not establish clinical accuracy. User photos must not become training data by default.

## Integration points

Keep the existing `/v1/decode` route and response shape. Add an interchangeable recognition candidate after benchmarking; the current Indian Qwen adapter in `ai/inference/` is offline and has not been promoted. Preserve disagreements for review instead of selecting a plausible medicine. The mobile app displays unresolved readings and raw OCR text after a retry, while preserving profile, medicine, and reminder storage. Keep datasets, training, and benchmark code in `ai/`; exported runtime models belong in `backend/models/` and are ignored by Git.
