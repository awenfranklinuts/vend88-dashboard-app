from fastapi import APIRouter

router = APIRouter(tags=["Sales"])


@router.get("/sales")
def get_sales():
    return [
        {"id": 1,  "date": "2026-04-15", "order_id": "#1042", "items": 3, "module": "POS",     "payment": "Card",  "total": "12.20", "status": "completed"},
        {"id": 2,  "date": "2026-04-15", "order_id": "#1041", "items": 2, "module": "POS",     "payment": "Card",  "total": "14.90", "status": "completed"},
        {"id": 3,  "date": "2026-04-15", "order_id": "#1040", "items": 2, "module": "Vending", "payment": "Cash",  "total": "6.50",  "status": "completed"},
        {"id": 4,  "date": "2026-04-15", "order_id": "#1039", "items": 4, "module": "KDS",     "payment": "Card",  "total": "22.00", "status": "in_progress"},
        {"id": 5,  "date": "2026-04-15", "order_id": "#1038", "items": 2, "module": "POS",     "payment": "Cash",  "total": "8.70",  "status": "completed"},
        {"id": 6,  "date": "2026-04-14", "order_id": "#1037", "items": 1, "module": "POS",     "payment": "Card",  "total": "4.50",  "status": "completed"},
        {"id": 7,  "date": "2026-04-14", "order_id": "#1036", "items": 3, "module": "Vending", "payment": "Card",  "total": "9.80",  "status": "completed"},
        {"id": 8,  "date": "2026-04-14", "order_id": "#1035", "items": 5, "module": "KDS",     "payment": "Card",  "total": "45.30", "status": "completed"},
        {"id": 9,  "date": "2026-04-13", "order_id": "#1034", "items": 2, "module": "POS",     "payment": "Cash",  "total": "18.00", "status": "completed"},
        {"id": 10, "date": "2026-04-13", "order_id": "#1033", "items": 1, "module": "Kiosk",   "payment": "Card",  "total": "6.20",  "status": "completed"},
    ]


@router.get("/sales/summary")
def get_sales_summary():
    return {
        "today":      {"revenue": "64.30",    "orders": 5,   "avg": "12.86"},
        "this_week":  {"revenue": "1,250.00", "orders": 42,  "avg": "29.76"},
        "this_month": {"revenue": "38,420.00","orders": 1380,"avg": "27.84"},
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
