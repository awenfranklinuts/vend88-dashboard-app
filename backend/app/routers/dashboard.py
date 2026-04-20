from fastapi import APIRouter

router = APIRouter(tags=["Dashboard"])


@router.get("/dashboard/summary")
def get_dashboard_summary():
    return {
        "today_sales": "1,250.00",
        "total_orders": 42,
        "total_products": 156,
        "avg_order_value": "29.76",
        "total_revenue_month": "38,420.00",
        "revenue_change_pct": 12.4,
        "orders_change_pct": 8.1,
    }


@router.get("/dashboard/revenue-chart")
def get_revenue_chart():
    return [
        {"day": "Mon", "revenue": 64},
        {"day": "Tue", "revenue": 60},
        {"day": "Wed", "revenue": 64},
        {"day": "Thu", "revenue": 53},
        {"day": "Fri", "revenue": 71},
        {"day": "Sat", "revenue": 86},
        {"day": "Sun", "revenue": 66},
    ]


@router.get("/dashboard/recent-orders")
def get_recent_orders():
    return [
        {"id": "#1042", "item": "Espresso x2, Croissant", "module": "POS", "total": "12.20", "status": "completed", "time": "2 min ago"},
        {"id": "#1041", "item": "Sandwich, Latte", "module": "POS", "total": "14.90", "status": "completed", "time": "11 min ago"},
        {"id": "#1040", "item": "Vend - Chips, Cola", "module": "Vending", "total": "6.50", "status": "completed", "time": "24 min ago"},
        {"id": "#1039", "item": "Kitchen Set A", "module": "KDS", "total": "22.00", "status": "in_progress", "time": "31 min ago"},
        {"id": "#1038", "item": "Espresso, Muffin", "module": "POS", "total": "8.70", "status": "completed", "time": "45 min ago"},
    ]


@router.get("/dashboard/modules")
def get_modules():
    return [
        {"id": "pos",     "name": "Point of Sale",    "icon": "storefront-outline",    "color": "#0f4cc9", "status": "online",  "today_txn": 36},
        {"id": "kds",     "name": "Kitchen Display",  "icon": "restaurant-outline",    "color": "#d97706", "status": "online",  "today_txn": 29},
        {"id": "vending", "name": "Vending Machine",  "icon": "cube-outline",          "color": "#059669", "status": "online",  "today_txn": 14},
        {"id": "kiosk",   "name": "Self-Service Kiosk","icon": "tablet-portrait-outline","color": "#7c3aed", "status": "offline", "today_txn": 0},
        {"id": "loyalty", "name": "Loyalty",           "icon": "star-outline",          "color": "#db2777", "status": "online",  "today_txn": 8},
        {"id": "reports", "name": "Reports",           "icon": "bar-chart-outline",     "color": "#0891b2", "status": "online",  "today_txn": 0},
    ]
