from fastapi import APIRouter

router = APIRouter(tags=["Sales"])


@router.get("/sales")
def get_sales():
    return [
        {"id": 1, "date": "2026-04-14", "total": "45.00"},
        {"id": 2, "date": "2026-04-14", "total": "32.50"},
        {"id": 3, "date": "2026-04-13", "total": "78.20"},
    ]
