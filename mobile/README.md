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

Default behavior:
1. The app auto-detects your PC LAN IP from the Expo host.
2. It builds API URL as http://YOUR_PC_IP:8000/api/v1 automatically.

Optional override (only if needed):

```bash
set EXPO_PUBLIC_API_BASE_URL=http://192.168.1.55:8000/api/v1
npx expo start --lan
```

Important:
1. Use your computer LAN IP, not localhost.
2. Start backend with host binding from backend folder:

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
