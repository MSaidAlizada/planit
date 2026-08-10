import logging

from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)

_DEV_SECRET = "planit-dev-secret-change-me-in-production"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    environment: str = "development"  # set ENVIRONMENT=production in prod

    database_url: str = "sqlite:///./planit.db"
    cors_origins: list[str] = ["http://localhost:3000"]
    app_name: str = "planit"

    # Google OAuth — set these in backend/.env
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://localhost:8000/auth/google/callback"
    frontend_url: str = "http://localhost:3000"

    # JWT — set JWT_SECRET_KEY in .env to a long random string
    # Generate one with: python -c "import secrets; print(secrets.token_hex(32))"
    jwt_secret_key: str = _DEV_SECRET
    jwt_algorithm: str = "HS256"
    jwt_expire_days: int = 30

    # Email (SMTP) — set these in backend/.env to enable sending
    # Gmail: use an App Password (Google Account → Security → 2-Step → App passwords)
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_user: str = ""        # your Gmail address, e.g. you@gmail.com
    smtp_password: str = ""    # 16-char App Password from Google
    smtp_from: str = ""        # defaults to smtp_user if blank

    def validate_for_environment(self) -> None:
        if self.environment == "production" and self.jwt_secret_key == _DEV_SECRET:
            raise RuntimeError(
                "JWT_SECRET_KEY must be set to a secure value in production. "
                "Generate one with: python -c \"import secrets; print(secrets.token_hex(32))\""
            )
        if self.jwt_secret_key == _DEV_SECRET:
            logger.warning(
                "Using the default dev JWT secret. Set JWT_SECRET_KEY in backend/.env before deploying."
            )


settings = Settings()
settings.validate_for_environment()
# Fall back smtp_from to smtp_user if not explicitly set
if not settings.smtp_from and settings.smtp_user:
    settings.smtp_from = settings.smtp_user
