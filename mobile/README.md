# MediDecode — Mobile Application (Frontend)

Cross-platform mobile application built with **React Native**, **Expo SDK 58**, and **Expo Router**. Designed for effortless handwritten prescription scanning, interactive medicine intelligence, generic drug alternatives, and scheduled dose adherence.

---

## 1. Overview & Key Features

* **File-Based Routing:** Seamless tab and modal navigation powered by `expo-router` (`src/app/`).
* **Prescription Photo Processing:** In-app camera and gallery image selection via `expo-image-picker` with client-side downsampling and file validation before upload.
* **Interactive Clinical Bottom-Sheet Drawer:**
  * **Extraction Confidence Badge:** `✓ High Confidence Extraction` badge with accuracy score percentage.
  * **4-Grid Metrics:** Instant view of **Dosage**, **Frequency** (e.g. `0-0-1 (Once daily at bedtime)`), **Meal Timing** (e.g. `After dinner`), and **Duration** (e.g. `7 days`).
  * **Clinical Indications:** Plain-language explanation of what the medication treats.
  * **Active Ingredients / Composition:** Color-coded active salt badges with strengths.
  * **Categorized Side Effects:** Clear separation between common mild effects and serious emergency red flags.
  * **Precautions & Safety:** Interaction warnings, food/alcohol restrictions, and driving cautions.
  * **Possible Generic Equivalents:** Identical active salt generic alternatives (such as India's **PMBJP Jan Aushadhi** and standard branded generics) with verification disclaimers.
  * **Action Footer:** Direct transition to dose reminder scheduling.
* **Smart Dose Scheduling:**
  * Strict 2-hour medical safety window (reminders cannot be rescheduled more than 2 hours away from doctor's instructions).
  * Meal timing associations (`before`, `after`, `with` food).
  * Hardware alarms and local notifications using `expo-notifications`.
* **Daily Timeline & Adherence:**
  * "Today" view showing remaining doses for the current day.
  * One-tap actions: Mark Taken, Snooze, or Undo.
* **Nearby Healthcare Discovery:**
  * Real-time GPS location via `expo-location` with fallback IP geocoding.
  * Filter hospitals and pharmacies by distance and public/government vs. private status.
  * Direct turn-by-turn navigation in Apple Maps or Google Maps via `expo-linking`.

---

## 2. Screens & Architecture

```
src/
├── app/
│   ├── (tabs)/
│   │   ├── index.tsx          # "Today" daily medication timeline & checklist
│   │   ├── medicines.tsx      # Decoded prescriptions & individual medicine cards
│   │   ├── scan.tsx           # Camera / gallery prescription upload & decoding
│   │   ├── reminders.tsx      # Configured daily alarm list & schedules
│   │   ├── hospitals.tsx      # Nearby medical centers, clinics & pharmacies
│   │   └── _layout.tsx        # Bottom tab bar navigation
│   ├── _layout.tsx            # Global providers (theme, safe area, state)
│   ├── settings.tsx           # Language switcher (EN, HI, TA) & account options
│   └── welcome.tsx            # First-run onboarding workflow
│
├── domain/                    # Medication rules, dose calculations & schedule math
├── features/                  # UI features (medicines.tsx, prescription.tsx, timeline.tsx)
├── lib/                       # API client, Supabase cloud sync, i18n, notifications
└── ui/                        # Reusable UI system (Sheet, Card, Button, Tap, Theme)
```

---

## 3. Getting Started (Development)

### Step 1: Install Dependencies
```bash
cd mobile
npm install
```

### Step 2: Configure Environment Variables
Create or verify `mobile/.env`:
```env
# LAN IP of your running FastAPI backend (Port 8102)
EXPO_PUBLIC_API_URL=http://172.16.148.205:8102

# Supabase Configuration (Optional for cloud sync)
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key
```

### Step 3: Start the Development Server
```bash
npm run start
# Or for web browser preview:
npm run web
```

---

## 4. How to Generate & Install on a Physical Mobile Device

### Method 1: Instant Mobile Preview via Expo Go (Recommended)
1. Download **Expo Go** from [Google Play](https://play.google.com/store/apps/details?id=host.exp.exponent) (Android) or [App Store](https://apps.apple.com/app/expo-go/id982107779) (iOS).
2. Connect your phone and computer to the same Wi-Fi network.
3. Open Expo Go and scan the terminal QR code, or enter:
   ```
   exp://<YOUR-COMPUTER-IP>:8100
   ```
4. The application boots natively with access to camera, haptics, and notifications.

---

### Method 2: Build Standalone Android APK (`.apk`) via EAS Cloud Build
You can compile a standalone `.apk` file that installs directly onto any Android phone without Expo Go:

1. Install EAS CLI:
   ```bash
   npm install -g eas-cli
   ```
2. Log in with a free Expo account:
   ```bash
   eas login
   ```
3. Trigger the APK build:
   ```bash
   npm run build:apk
   ```
   *(This uses the pre-configured `mobile/eas.json` with `"buildType": "apk"`)*
4. Once compilation completes in the cloud, EAS outputs a **direct download link** and **QR code**. Open the link on your Android device to download and install `app-release.apk`.

---

### Method 3: Local Standalone Android Build (Gradle / Android Studio)
1. Prebuild the native Android wrapper:
   ```bash
   npx expo prebuild --platform android
   ```
2. Compile release APK:
   ```bash
   cd android
   ./gradlew assembleRelease
   ```
3. Locate the APK:
   ```
   mobile/android/app/build/outputs/apk/release/app-release.apk
   ```

---

### Method 4: Progressive Web App (PWA) Install
1. Open mobile Chrome or Safari and navigate to:
   ```
   http://<YOUR-COMPUTER-IP>:8100
   ```
2. Tap the browser menu $\rightarrow$ **"Add to Home Screen"**.
3. Launch directly from your home screen as a fullscreen app.

---

## 5. Scripts & Testing

* **Run Domain Unit Tests:**
  ```bash
  npm test
  ```
  *(Verifies medication scheduling mathematics, time-window limits, dose statuses, and persistence rules)*
* **Run Playwright E2E Tests:**
  ```bash
  npm run test:e2e
  ```
  *(Automated headless browser tests for onboarding, OCR flow, drawer display, and reminder sync)*
* **TypeScript Compilation Check:**
  ```bash
  npm run typecheck
  ```
* **Linting:**
  ```bash
  npm run lint
  ```
