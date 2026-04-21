from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel

router = APIRouter(prefix="/admin", tags=["admin"])

# Demo admin credentials (development only)
_DEMO_ADMINS = {
    "demo@vend88.com": "vend8800",
}


class LoginRequest(BaseModel):
    email: str
    password: str


@router.post("/login", summary="Admin Login")
def admin_login(body: LoginRequest):
    stored = _DEMO_ADMINS.get(body.email)

    if stored is None or stored != body.password:
        return JSONResponse(
            status_code=400,
            content={
                "status_code": 400,
                "message": "email not belong to an active admin or invalid password",
            },
        )

    return {
        "status_code": 200,
        "message": "Login successful",
        "token": f"demo-token-{body.email}",
        "role": "admin",
    }
