from fastapi import APIRouter

router = APIRouter(tags=["Products"])


@router.get("/products")
def get_products():
    return [
        {"id": 1, "name": "Espresso", "category": "Beverages", "price": "4.50"},
        {"id": 2, "name": "Croissant", "category": "Bakery", "price": "3.20"},
        {"id": 3, "name": "Sandwich", "category": "Food", "price": "8.90"},
    ]
