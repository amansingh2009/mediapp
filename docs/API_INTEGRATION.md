# API and mobile integration

`POST /v1/decode` accepts multipart `file` and returns `medicines`, `hospital`, `doctor`, `engine`, `review_required`, `raw_text`, and `model_words`. Medicine rows contain `name`, `strength`, `dosage`, `frequency`, `duration_days`, `instruction`, `original`, `model`, and `printed`. Empty strings and null duration mean unreadable or absent, not a recommendation. The API still uses the existing response shape so stored profiles and mobile rendering remain compatible.

The scanner in `mobile/src/app/(tabs)/scan.tsx` calls `mobile/src/lib/api.ts`; the result is stored via `mobile/src/state/store.ts` and shown by `mobile/src/app/prescription/[id].tsx`. A failed scan preserves the photo for retry. The retry screen can reveal raw OCR text on demand without writing it to benchmark reports or logs. Existing demo decoding remains available.

HTTP 413 means size/dimensions exceeded; 422 means invalid image; 503 means the local reader is missing or failed; 401 applies to missing/invalid production sessions; 429 is the per-identity development API rate limit. Production requires Supabase Auth configuration. The local development guest mode must not be used as production authorization. An experimental vision-model reader is kept in `ai/` until its output and resource use are measured; it does not change `/v1/decode` today.
