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
