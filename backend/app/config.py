import os
from pathlib import Path
from typing import List, Optional
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field

BASE_DIR = Path(__file__).resolve().parent.parent

class Settings(BaseSettings):
    # Database Configuration (PostgreSQL / Supabase Connection Pooler or Direct)
    DATABASE_URL: str = Field(
        default="postgresql://postgres:postgres@localhost:5432/postgres",
        description="PostgreSQL/Supabase connection string"
    )
    # Redis Configuration (Upstash or Redis URI, supports rediss:// for TLS)
    REDIS_URL: str = Field(
        default="redis://localhost:6379",
        description="Redis/Upstash connection string"
    )
    # CORS Configuration
    CORS_ORIGINS: str = Field(
        default="http://localhost:3000,http://127.0.0.1:3000",
        description="Comma-separated list of allowed origins"
    )
    
    # Server Configuration
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    ENVIRONMENT: str = "production"
    
    # Cryptographic & Protocol Rules
    REPLAY_TOLERANCE_SECONDS: int = 300  # 5 minutes
    SLOT_10_COOLDOWN_HOURS: int = 168    # 7 days (The Titan Rule)

    # Security & Admin Command Center
    ADMIN_SECRET_KEY: str = Field(
        default="bhuvan-sovereign-admin-key-change-in-production",
        description="Secret key required for /api/v1/admin/* command center endpoints"
    )

    # Cloud Storage Configuration (S3 / Cloudflare R2 / Supabase Storage / Local)
    STORAGE_BACKEND: str = Field(
        default="local",
        description="Storage provider: 'local' or 's3'"
    )
    S3_BUCKET: str = Field(default="", description="S3 bucket name")
    S3_ENDPOINT_URL: Optional[str] = Field(default=None, description="Custom S3 endpoint for Cloudflare R2 or MinIO")
    S3_ACCESS_KEY_ID: Optional[str] = Field(default=None, description="AWS/R2 Access Key")
    S3_SECRET_ACCESS_KEY: Optional[str] = Field(default=None, description="AWS/R2 Secret Key")
    S3_REGION: str = Field(default="auto", description="AWS/R2 region name")
    S3_PUBLIC_URL_PREFIX: Optional[str] = Field(
        default=None,
        description="Custom CDN public domain prefix e.g. https://cdn.bhuvan.network"
    )

    # Rate Limiting
    RATE_LIMIT_UPLOAD_PER_MINUTE: int = Field(default=10, description="Max media uploads per minute per IP")
    RATE_LIMIT_FOLLOW_PER_MINUTE: int = Field(default=30, description="Max follow toggle requests per minute per IP")
    RATE_LIMIT_BROADCAST_PER_MINUTE: int = Field(default=20, description="Max broadcast attempts per minute per IP")

    @property
    def cors_origins_list(self) -> List[str]:
        if not self.CORS_ORIGINS or self.CORS_ORIGINS.strip() == "*":
            return ["*"]
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    model_config = SettingsConfigDict(
        env_file=(str(BASE_DIR / ".env"), ".env"),
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore"
    )

settings = Settings()
