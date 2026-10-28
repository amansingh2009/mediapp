# Mediapp mobile

Expo/React Native app for prescription profiles, medicine review, reminders,
and nearby care. The projects are siblings:

- `../mobile` — this mobile app
- `../backend` — FastAPI, Supabase migrations, and runtime OCR models
- `../ai` — datasets, training scripts, and experiment checkpoints

For local development, start the backend from `../backend` with
`.venv/bin/python run.py`, then start this app with `npm run web` (or
`npx expo start` for a device). The app calls port 8102 by default in local
development; set `EXPO_PUBLIC_API_URL` for a deployed backend. Put the mobile
Supabase URL and publishable key in this project's `.env`; put the API's
server-side configuration in `../backend/.env`.

Use the model output as a reading aid only. Decoded medicines require review
against the original prescription before reminders can be saved.
