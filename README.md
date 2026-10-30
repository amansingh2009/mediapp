# 🩺 MediDecode — AI Prescription Decoder & Smart Medication Companion

[![React Native](https://img.shields.io/badge/React_Native-0.88-61DAFB?style=flat-square&logo=react&logoColor=black)](https://reactnative.dev/)
[![Expo](https://img.shields.io/badge/Expo-SDK_58-000020?style=flat-square&logo=expo&logoColor=white)](https://expo.dev/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Google Gemini](https://img.shields.io/badge/Google_Gemini-Vision_AI-4285F4?style=flat-square&logo=google&logoColor=white)](https://ai.google.dev/)
[![Supabase](https://img.shields.io/badge/Supabase-Auth_%26_Sync-3ECF8E?style=flat-square&logo=supabase&logoColor=white)](https://supabase.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)

> **MediDecode turns illegible handwritten prescriptions into verified medicine facts, plain-language dosage schedules (`3 Times/day`), affordable generic equivalents, and smart reminders.**

---

## 🚨 The Problem Statement

Handwritten prescriptions remain a dangerous, multi-billion-dollar bottleneck in patient healthcare:

```
      Doctor's Cursive Handwriting                   Patient Frustration & Risks
┌──────────────────────────────────────┐       ┌──────────────────────────────────────┐
│  • Illegible scrawl & abbreviations  │  ──►  │  • Dispensing & dosage errors        │
│  • "TDS", "BD", "HS", "0-0-1", "AC"  │       │  • No explanation of uses/side effects│
│  • No duration or dosage clarity     │       │  • Overpaying for costly brand names │
│  • Zero adherence tracking           │       │  • Missed doses & preventable illness│
└──────────────────────────────────────┘       └──────────────────────────────────────┘
```

| ❌ Real-World Problem | ✅ MediDecode Fix |
|:---|:---|
| **Illegible Doctor Cursive** | **Google Gemini Vision AI** transcribes handwritten scripts into validated clinical data. |
| **Cryptic Latin Shorthand** | Auto-translates abbreviations (`TDS`, `BD`, `1-0-1`, `HS`) into **`3 Times/day`**, **`2 Times/day`**, or **`At bedtime`**. |
| **Unspecified Treatment Length** | Intelligent clinical fallbacks surface safe standard durations labeled with **`(generally)`**. |
| **Lack of Drug Education** | In-app drawer explains **What it's used for**, **Active Salts**, **Mild Reactions**, and **Emergency Signs**. |
| **Expensive Branded Drugs** | Maps exact active salts to bioequivalent **Generic Alternatives** (e.g., PMBJP Jan Aushadhi). |
| **Medication Non-Adherence** | Auto-configures daily alarm reminders locked strictly to doctor-prescribed frequencies. |

---

## 📱 Application Preview

| 📸 1. Scan & Upload | 🩺 2. Decoded Prescription | 📋 3. Clinical Intelligence |
|:---:|:---:|:---:|
| <img src="docs/screenshots/01-scan-screen.png" width="240" alt="Scan Screen" /> | <img src="docs/screenshots/02-decoded-medicines.png" width="240" alt="Decoded Medicines" /> | <img src="docs/screenshots/03-clinical-details.png" width="240" alt="Clinical Details" /> |
| *Capture prescription photo or select from gallery* | *Extracted medicines, dosages & standard frequencies* | *Confidence score, indications, side effects & generics* |

| ⏰ 4. Smart Reminders | 📅 5. Daily Adherence Timeline | 🏥 6. Nearby Healthcare |
|:---:|:---:|:---:|
| <img src="docs/screenshots/04-reminder-schedule.png" width="240" alt="Reminder Schedule" /> | <img src="docs/screenshots/05-timeline-adherence.png" width="240" alt="Adherence Timeline" /> | <img src="docs/screenshots/06-nearby-hospitals.png" width="240" alt="Nearby Hospitals" /> |
| *Time slots locked to frequency with safety bounds* | *Check off doses, snooze, and track daily progress* | *Live GPS finder for verified government & private care* |

---

## ⚡ Core Features

* **🔬 Multi-Modal AI Prescription Parsing**: Powered by Google Gemini (`gemini-3-flash-preview` / `gemini-3.5-flash`) with constrained schema decoding to transcribe drug names, strengths, dosages, and instructions without hallucination.
* **📑 Interactive Clinical Intelligence Drawer**:
  * **Extraction Confidence**: Visual confidence score badge (e.g. `High Confidence Extraction · 97%`).
  * **4-Grid Metrics**: Quick view of **Dosage**, **Frequency** (`3 Times/day`), **Meal Timing** (`After meals`), and **Duration** (`7 days (generally)`).
  * **What Is This Used For?**: Plain-language clinical indications written for patients.
  * **Active Ingredients & Composition**: Pharmacological salt breakdown with exact strengths.
  * **Mild vs. Emergency Effects**: Differentiates mild reactions (drowsiness, dry mouth) from critical red flags.
  * **Generic Substitutes**: Matches active salts to affordable bioequivalent generics (e.g., PMBJP Jan Aushadhi).
* **⏰ Medication Scheduling & Safety**:
  * **Frequency-Locked Slots**: Prevents arbitrary dose multiplication (e.g., 3 Times/day provides exactly 3 slots).
  * **Anchored Safety Windows**: Constrains reminder adjustments within 2 hours of physician instructions.
  * **Timeline Actions**: Interactive **Mark Taken**, **Snooze (10m)**, and **Undo** buttons.
* **🏥 GPS Hospital & Emergency Finder**:
  * Automatically detects current city/coordinates and queries Google Places.
  * Filters by **Government / Public Hospital**, **Clinic**, or **24/7 Emergency Care** with one-tap Google Maps directions and direct calls.
* **🔒 Offline First & Private**:
  * Works 100% offline using local SQLite / device storage for ongoing daily schedules.
  * Optional encrypted Supabase cloud synchronization across mobile devices.

---

## 🔄 How It Works: Workflows

### 👤 User Workflow

```mermaid
flowchart TD
    Start(["📸 User Snaps Prescription Photo"]) --> Decode["⚡ AI Extracts Medicines, Strengths & Dosing"]
    Decode --> Review{"Review Decoded Medicine Cards"}
    Review -->|Tap Medicine| Drawer["📋 Clinical Drawer: Uses, Risks & Generics"]
    Review -->|Tap Set Reminder| Schedule["⏰ Configure Reminders (Locked to Frequency)"]
    Drawer --> Schedule
    Schedule --> Timeline["📅 Check Off Doses on Daily Timeline"]
    Timeline --> Care["🏥 Find Nearby Pharmacies & Emergency Care"]
```

---

### ⚙️ Application Architecture Workflow

```mermaid
sequenceDiagram
    autonumber
    actor User as Patient / Mobile Client
    participant App as React Native / Expo (Port 8100)
    participant API as FastAPI Backend (Port 8102)
    participant AI as Google Gemini Vision OCR
    participant Ref as Clinical Knowledge Base / NHS
    participant DB as SQLite Local / Supabase

    User->>App: Take photo of handwritten prescription
    App->>API: POST /v1/decode (Image Multipart)
    API->>AI: Multi-Modal Vision Request + Strict JSON Schema
    AI-->>API: Extracted JSON (Drug names, strengths, frequencies)
    API->>Ref: Match active ingredients, side effects & Jan Aushadhi generics
    Ref-->>API: Clinical monographs & bioequivalent alternatives
    API-->>App: Unified Decoded Prescription Response
    App-->>User: Display Decoded Cards with Frequency & (generally) Badges
    User->>App: Click "Set Medicine Reminder"
    App->>DB: Save dose schedule & register local OS notifications
    Note over App: System alarms alert patient at scheduled dose times
    User->>App: Mark Taken on Today's Timeline
```

---

## 📂 Project Folder Structure

```
mediscan/
├── mobile/                        # React Native / Expo Frontend Application
│   ├── src/
│   │   ├── app/                   # Expo Router file-based screens
│   │   │   ├── (tabs)/            # Main navigation tabs
│   │   │   │   ├── index.tsx      # Today's Medication Timeline & dose tracker
│   │   │   │   ├── scan.tsx       # Camera capture, gallery picker & OCR decode
│   │   │   │   ├── medicines.tsx  # Decoded prescriptions & medicine list
│   │   │   │   ├── reminders.tsx  # Active schedules & alarm manager
│   │   │   │   └── hospitals.tsx  # Nearby GPS hospitals & emergency centers
│   │   │   └── _layout.tsx        # Navigation providers, safe-area & themes
│   │   ├── domain/                # Dosing math, scheduling safety & interval logic
│   │   ├── features/              # UI components (medicines.tsx, clinical drawer)
│   │   ├── lib/                   # API client, Supabase auth, notifications & i18n
│   │   └── ui/                    # Design tokens, bottom sheets, buttons & cards
│   ├── assets/                    # App branding, icons & splash screen
│   ├── tests/                     # Unit test suites & Playwright browser E2E tests
│   └── package.json               # Mobile dependencies & NPM scripts
│
├── backend/                       # FastAPI Python Backend Service
│   ├── gemini_decoder.py          # Google Gemini Vision prescription OCR pipeline
│   ├── main.py                    # API entrypoint, routes, CORS & rate-limiting
│   ├── reference.py               # FDA & NHS clinical monographs lookup service
│   ├── medicine_catalog.json      # Indian generic (Jan Aushadhi) pharmaceutical database
│   ├── run.py                     # Uvicorn production server launcher (Port 8102)
│   ├── requirements.txt           # Python backend dependencies
│   └── test_backend.py            # Pytest backend API verification suite
│
├── docs/                          # Project Documentation & Assets
│   ├── screenshots/               # App preview screenshots (01 to 06)
│   ├── AI_ARCHITECTURE.md         # Multi-modal AI vision model architecture
│   └── SECURITY_AND_SAFETY.md     # Patient privacy & clinical non-fabrication policies
│
└── README.md                      # Project master documentation (You are here)
```

---

## 🚀 Quick Start: Running the Project

### 📋 Prerequisites
* **Node.js**: `v20+` (`node -v`)
* **Python**: `3.10+` (`python3 --version`)
* **Gemini API Key**: Free key from [Google AI Studio](https://aistudio.google.com/)

---

### Step 1: Launch the Backend (FastAPI)

```bash
# 1. Open a terminal and enter backend/
cd backend

# 2. Create virtual environment & activate
python3 -m venv .venv
source .venv/bin/activate       # On Windows: .venv\Scripts\activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Set your Gemini API key in .env
cp .env.example .env
# Edit .env and set: GEMINI_API_KEY=your_gemini_key_here

# 5. Start the backend
python run.py
```
> Backend runs at: **`http://127.0.0.1:8102`** (Verify: `curl http://127.0.0.1:8102/health`)

---

### Step 2: Launch the Mobile App (Expo / React Native)

```bash
# 1. Open a second terminal and enter mobile/
cd mobile

# 2. Install dependencies
npm install

# 3. Configure backend URL
echo "EXPO_PUBLIC_API_URL=http://localhost:8102" > .env

# 4. Start Expo development server
npm run start
```

Press **`w`** in the terminal to open the app instantly in your web browser!

---

### 📲 Step 3: Run on Your Physical Mobile Phone

#### Option A: Expo Go (Instant · 30 Seconds · Zero Build Required)
1. Install **Expo Go** from [Google Play Store](https://play.google.com/store/apps/details?id=host.exp.exponent) or [iOS App Store](https://apps.apple.com/app/expo-go/id982107779).
2. Connect your smartphone to the **same Wi-Fi network** as your laptop.
3. Update `mobile/.env` with your laptop's local LAN IP:
   ```env
   EXPO_PUBLIC_API_URL=http://192.168.1.15:8102
   ```
4. Start Expo (`npm run start`) and scan the terminal QR code using **Expo Go** (Android) or the native **Camera** app (iOS).

#### Option B: Standalone Android APK (`.apk`)
```bash
cd mobile
npm install -g eas-cli
eas login
npm run build:apk
```
EAS builds a standalone native APK in the cloud and provides a direct download link to install on any Android phone.

---

## 🧪 Testing & Verification

```bash
# 1. Run domain unit tests (Dose math, time window safety, status state machine)
cd mobile && node tests/domain.test.cjs

# 2. Run automated browser E2E tests (10 full-flow Playwright scenarios)
cd mobile && npx playwright test tests/browser/prescription.spec.ts

# 3. TypeScript validation
cd mobile && npx tsc --noEmit

# 4. Backend tests
cd backend && source .venv/bin/activate && pytest test_backend.py -v
```

---

## ⚠️ Medical Safety & Non-Fabrication Policy

> [!IMPORTANT]
> **MediDecode is an educational and organizational aid, not a licensed medical authority.**
>
> 1. **Zero Hallucination Constraint**: The AI model is strictly constrained against guessing unreadable cursive. Unclear inscriptions are marked as `Review Required`.
> 2. **Professional Verification**: Generic alternatives and active salts are surfaced for consultation with your doctor or pharmacist. Never substitute prescribed medicines without professional confirmation.
> 3. **Schedule Safety Boundary**: Patient time changes are restricted within a 2-hour window of the prescribed frequency to prevent unsafe dosage stacking.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
