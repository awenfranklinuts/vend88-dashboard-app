from fastapi import APIRouter

router = APIRouter(tags=["Dashboard"])


@router.get("/dashboard/summary")
def get_dashboard_summary():
    return {
        "today_sales": "1,250.00",
        "total_orders": 42,
        "total_products": 156,
        "avg_order_value": "29.76",
    }
