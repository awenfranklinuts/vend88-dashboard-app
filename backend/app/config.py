from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    cors_origins: List[str] = ["http://localhost:3000"]

    class Config:
        env_file = ".env"


settings = Settings()
