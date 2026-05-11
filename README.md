# VEND88 Dashboard

Mobile-first POS dashboard app using Expo (React Native) with a FastAPI backend.

## Project Structure

```
vend88-dashboard-app/
|- mobile/             # Expo app (primary client)
|- backend/            # FastAPI server
|- app.json            # Root Expo config (optional)
|- eas.json            # Root EAS config (optional)
`- README.md
```

## Getting Started

### 1) Backend (FastAPI)

```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
```

Backend URL: http://localhost:8000
API docs: http://localhost:8000/docs

### 2) Mobile App (Expo)

```bash
cd mobile
npm install
npm start
```

Then run on device/simulator with:

```bash
npm run android
# or
npm run ios
```

## Mobile API Target Switch

Configure `mobile/.env`:

```bash
EXPO_PUBLIC_API_TARGET=official
# or
EXPO_PUBLIC_API_TARGET=custom

EXPO_PUBLIC_OFFICIAL_API_BASE_URL=https://dev.vend88.com
EXPO_PUBLIC_CUSTOM_API_BASE_URL=http://192.168.1.55:8000/api/v1
```
