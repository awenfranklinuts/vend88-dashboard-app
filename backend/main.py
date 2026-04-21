from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.routers import dashboard, sales, products, admin

app = FastAPI(
    title="VEND88 Dashboard API",
    version="0.1.0",
    description="Backend API for VEND88 POS Dashboard",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(admin.router)
app.include_router(dashboard.router, prefix="/api/v1")
app.include_router(sales.router, prefix="/api/v1")
app.include_router(products.router, prefix="/api/v1")


@app.get("/")
def root():
    return {"message": "VEND88 Dashboard API", "version": "0.1.0"}
