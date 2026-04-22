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


@router.get("/dashboard/top-products")
def get_top_products():
    return [
        {"id": 1, "name": "Espresso",   "category": "Beverages", "units": 42, "revenue": "189.00", "change_pct":  18.2},
        {"id": 2, "name": "Croissant",  "category": "Bakery",    "units": 28, "revenue": "89.60",  "change_pct":   7.4},
        {"id": 3, "name": "Sandwich",   "category": "Food",      "units": 19, "revenue": "169.10", "change_pct":  -3.1},
        {"id": 4, "name": "Latte",      "category": "Beverages", "units": 17, "revenue": "76.50",  "change_pct":  12.9},
        {"id": 5, "name": "Muffin",     "category": "Bakery",    "units": 12, "revenue": "38.40",  "change_pct":   2.0},
    ]


@router.get("/dashboard/stores")
def get_stores():
    return [
        {"id": "all",      "name": "All stores", "today_revenue": "1,250.00", "orders": 42, "status": "online",  "is_aggregate": True},
        {"id": "downtown", "name": "Downtown",   "today_revenue": "720.40",   "orders": 24, "status": "online",  "is_aggregate": False},
        {"id": "mall",     "name": "Mall",       "today_revenue": "412.60",   "orders": 14, "status": "online",  "is_aggregate": False},
        {"id": "airport",  "name": "Airport",    "today_revenue": "117.00",   "orders": 4,  "status": "offline", "is_aggregate": False},
    ]
