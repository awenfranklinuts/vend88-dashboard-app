from fastapi import APIRouter

router = APIRouter(tags=["Sales"])


@router.get("/sales")
def get_sales():
    return [
        # ── Today (Monday 20 Apr) ─────────────────────────────────────
        {"id": 1,  "date": "2026-04-20 14:32", "order_id": "#1072", "items": 2, "module": "POS",     "payment": "Card",   "total": "11.40", "status": "completed"},
        {"id": 2,  "date": "2026-04-20 13:18", "order_id": "#1071", "items": 1, "module": "Vending", "payment": "Cash",   "total": "3.50",  "status": "completed"},
        {"id": 3,  "date": "2026-04-20 12:05", "order_id": "#1070", "items": 4, "module": "KDS",     "payment": "Card",   "total": "28.90", "status": "completed"},
        {"id": 4,  "date": "2026-04-20 10:47", "order_id": "#1069", "items": 1, "module": "POS",     "payment": "Cash",   "total": "4.50",  "status": "completed"},
        {"id": 5,  "date": "2026-04-20 09:15", "order_id": "#1068", "items": 3, "module": "POS",     "payment": "Wallet", "total": "16.00", "status": "in_progress"},

        # ── Sunday 19 Apr ─────────────────────────────────────────────
        {"id": 6,  "date": "2026-04-19 18:22", "order_id": "#1067", "items": 2, "module": "POS",     "payment": "Card",   "total": "9.80",  "status": "completed"},
        {"id": 7,  "date": "2026-04-19 15:45", "order_id": "#1066", "items": 5, "module": "KDS",     "payment": "Card",   "total": "42.50", "status": "completed"},
        {"id": 8,  "date": "2026-04-19 11:30", "order_id": "#1065", "items": 1, "module": "Kiosk",   "payment": "QR",     "total": "6.20",  "status": "completed"},
        {"id": 9,  "date": "2026-04-19 09:10", "order_id": "#1064", "items": 2, "module": "Vending", "payment": "Cash",   "total": "7.00",  "status": "completed"},

        # ── Saturday 18 Apr ───────────────────────────────────────────
        {"id": 10, "date": "2026-04-18 19:55", "order_id": "#1063", "items": 3, "module": "POS",     "payment": "Card",   "total": "18.70", "status": "completed"},
        {"id": 11, "date": "2026-04-18 16:20", "order_id": "#1062", "items": 2, "module": "POS",     "payment": "Cash",   "total": "8.40",  "status": "completed"},
        {"id": 12, "date": "2026-04-18 14:00", "order_id": "#1061", "items": 6, "module": "KDS",     "payment": "Card",   "total": "55.30", "status": "completed"},
        {"id": 13, "date": "2026-04-18 10:45", "order_id": "#1060", "items": 1, "module": "Vending", "payment": "QR",     "total": "4.00",  "status": "completed"},

        # ── Friday 17 Apr ─────────────────────────────────────────────
        {"id": 14, "date": "2026-04-17 20:10", "order_id": "#1059", "items": 4, "module": "KDS",     "payment": "Card",   "total": "36.80", "status": "completed"},
        {"id": 15, "date": "2026-04-17 17:35", "order_id": "#1058", "items": 1, "module": "POS",     "payment": "Cash",   "total": "4.50",  "status": "completed"},
        {"id": 16, "date": "2026-04-17 14:50", "order_id": "#1057", "items": 2, "module": "POS",     "payment": "Card",   "total": "12.90", "status": "completed"},
        {"id": 17, "date": "2026-04-17 11:20", "order_id": "#1056", "items": 3, "module": "Vending", "payment": "Cash",   "total": "10.50", "status": "completed"},
        {"id": 18, "date": "2026-04-17 09:00", "order_id": "#1055", "items": 1, "module": "Kiosk",   "payment": "Wallet", "total": "5.80",  "status": "in_progress"},

        # ── Thursday 16 Apr ───────────────────────────────────────────
        {"id": 19, "date": "2026-04-16 18:40", "order_id": "#1054", "items": 2, "module": "POS",     "payment": "Card",   "total": "14.20", "status": "completed"},
        {"id": 20, "date": "2026-04-16 15:15", "order_id": "#1053", "items": 3, "module": "KDS",     "payment": "Card",   "total": "27.60", "status": "completed"},
        {"id": 21, "date": "2026-04-16 12:30", "order_id": "#1052", "items": 1, "module": "POS",     "payment": "Cash",   "total": "3.20",  "status": "completed"},
        {"id": 22, "date": "2026-04-16 10:05", "order_id": "#1051", "items": 2, "module": "Vending", "payment": "QR",     "total": "8.00",  "status": "completed"},

        # ── Wednesday 15 Apr ──────────────────────────────────────────
        {"id": 23, "date": "2026-04-15 17:50", "order_id": "#1050", "items": 3, "module": "POS",     "payment": "Card",   "total": "12.20", "status": "completed"},
        {"id": 24, "date": "2026-04-15 14:25", "order_id": "#1049", "items": 2, "module": "POS",     "payment": "Card",   "total": "14.90", "status": "completed"},
        {"id": 25, "date": "2026-04-15 12:10", "order_id": "#1048", "items": 2, "module": "Vending", "payment": "Cash",   "total": "6.50",  "status": "completed"},
        {"id": 26, "date": "2026-04-15 10:30", "order_id": "#1047", "items": 4, "module": "KDS",     "payment": "Card",   "total": "22.00", "status": "in_progress"},
        {"id": 27, "date": "2026-04-15 08:45", "order_id": "#1046", "items": 2, "module": "POS",     "payment": "Cash",   "total": "8.70",  "status": "completed"},

        # ── Tuesday 14 Apr ────────────────────────────────────────────
        {"id": 28, "date": "2026-04-14 16:55", "order_id": "#1045", "items": 1, "module": "POS",     "payment": "Card",   "total": "4.50",  "status": "completed"},
        {"id": 29, "date": "2026-04-14 13:30", "order_id": "#1044", "items": 3, "module": "Vending", "payment": "Card",   "total": "9.80",  "status": "completed"},
        {"id": 30, "date": "2026-04-14 11:15", "order_id": "#1043", "items": 5, "module": "KDS",     "payment": "Card",   "total": "45.30", "status": "completed"},

        # ── Monday 13 Apr (last week — for comparison) ────────────────
        {"id": 31, "date": "2026-04-13 15:20", "order_id": "#1042", "items": 2, "module": "POS",     "payment": "Cash",   "total": "18.00", "status": "completed"},
        {"id": 32, "date": "2026-04-13 10:40", "order_id": "#1041", "items": 1, "module": "Kiosk",   "payment": "Card",   "total": "6.20",  "status": "completed"},
    ]


@router.get("/sales/summary")
def get_sales_summary():
    return {
        "today":      {"revenue": "64.30",    "orders": 5,   "avg": "12.86"},
        "this_week":  {"revenue": "489.70",   "orders": 32,  "avg": "15.30"},
        "this_month": {"revenue": "513.90",   "orders": 34,  "avg": "15.11"},
    }


@router.get("/sales/by-module")
def get_sales_by_module():
    return [
        {"module": "POS",     "revenue": 820.50, "orders": 28, "pct": 65},
        {"module": "KDS",     "revenue": 267.30, "orders": 9,  "pct": 21},
        {"module": "Vending", "revenue": 104.20, "orders": 4,  "pct": 8},
        {"module": "Kiosk",   "revenue": 58.00,  "orders": 1,  "pct": 5},
        {"module": "Loyalty", "revenue": 0,      "orders": 0,  "pct": 1},
    ]
