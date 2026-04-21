# VEND88 Dashboard Mobile

Expo Router mobile app for iOS and Android, designed for store owners using VEND88 Dashboard.

## Prerequisites

1. Node.js 20+
2. Expo Go on iPhone and Android devices
3. Backend running from the root project at port 8000

## Install

```bash
cd mobile
npm install
```

## Run With Expo Go

```bash
npx expo start --lan
```

Use Expo Go to scan the QR code.

If LAN fails due network restrictions, fallback to tunnel:

```bash
npx expo start --tunnel
```

## API URL Configuration

Switch target using `.env`:

```bash
EXPO_PUBLIC_API_TARGET=official
# EXPO_PUBLIC_API_TARGET=custom

EXPO_PUBLIC_OFFICIAL_API_BASE_URL=https://dev.vend88.com
# Optional: app will auto-discover via /search/business_search when possible
EXPO_PUBLIC_OFFICIAL_BUSINESS_ID=69927553f830b9f210001917
# Optional fallback only (runtime login session is preferred)
EXPO_PUBLIC_OFFICIAL_EMAIL=your-admin-email
EXPO_PUBLIC_OFFICIAL_TOKEN=your-official-token
EXPO_PUBLIC_CUSTOM_API_BASE_URL=http://192.168.1.55:8000/api/v1
```

`EXPO_PUBLIC_OFFICIAL_BUSINESS_ID` is optional if auto-discovery succeeds.
The app first tries `/meta/get_meta` (uses `meta.BUSINESS_SELECTION`) and then falls back to `/search/business_search`.
For security, email/token should come from login at runtime (SecureStore). Keep env email/token only for temporary testing.

Quick terminal switch examples:

```bash
# Official API
export EXPO_PUBLIC_API_TARGET=official

# Custom backend API
export EXPO_PUBLIC_API_TARGET=custom
export EXPO_PUBLIC_CUSTOM_API_BASE_URL=http://192.168.1.55:8000/api/v1

npx expo start --lan
```

Important:
1. Use your computer LAN IP, not localhost.
2. Keep `EXPO_PUBLIC_API_TARGET=custom` when using local backend.
3. Start backend with host binding from backend folder:

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

## Implemented Mobile Features

1. Login screen with form validation
2. Secure auth token storage using SecureStore
3. Protected tab navigation
4. Dashboard, Sales, Products, Settings screens
5. Backend integration for summary, sales, and products endpoints
6. Sign out flow

## Notes

1. Current backend does not expose /auth/login yet.
2. In development, login supports demo mode with any valid email and password length of at least 6.
