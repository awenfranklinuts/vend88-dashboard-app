# VEND88 Dashboard

POS Dashboard App for Mobile — React frontend + FastAPI backend.

## Project Structure

```
vend88-dashboard-app/
├── frontend/          # React app (mobile-first UI)
│   ├── public/
│   ├── src/
│   │   ├── components/   # Shared components (Layout, BottomNav)
│   │   ├── pages/        # Page components (Dashboard, Sales, Products, Settings)
│   │   ├── services/     # API client (axios)
│   │   └── styles/       # CSS files
│   ├── .env
│   └── package.json
├── backend/           # FastAPI server
│   ├── app/
│   │   ├── routers/      # API route handlers
│   │   └── config.py     # App settings
│   ├── main.py
│   ├── .env
│   └── requirements.txt
└── README.md
```

## Getting Started

### Backend (FastAPI)

```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS/Linux
pip install -r requirements.txt
uvicorn main:app --reload
```

API runs at **http://localhost:8000**. Docs at **http://localhost:8000/docs**.

### Frontend (React)

```bash
cd frontend
npm install
npm start
```

App runs at **http://localhost:3000**.

## API Target Switch (Official vs Custom)

Use `.env.example` as template and configure:

```bash
REACT_APP_API_TARGET=official
# or
REACT_APP_API_TARGET=custom

REACT_APP_OFFICIAL_API_URL=https://dev.vend88.com
REACT_APP_CUSTOM_API_URL=http://localhost:8000/api/v1
```

For mobile, configure `mobile/.env`:

```bash
EXPO_PUBLIC_API_TARGET=official
# or
EXPO_PUBLIC_API_TARGET=custom

EXPO_PUBLIC_OFFICIAL_API_BASE_URL=https://dev.vend88.com
EXPO_PUBLIC_CUSTOM_API_BASE_URL=http://192.168.1.55:8000/api/v1
```
