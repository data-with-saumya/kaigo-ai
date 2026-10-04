from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "local"
    storage_backend: str = "memory"        # memory | firestore
    firestore_root: str = "workspaces"     # v2 deploys use "workspaces_v2" so versions never share data
    auth_mode: str = "dev"                 # dev (X-Workspace-Id header) | firebase (ID token)
    gemini_backend: str = "off"            # off | vertex | api_key
    gemini_model: str = "gemini-3.8-flash"
    gemini_location: str = "global"
    gemini_thinking_level: str = "LOW"     # LOW keeps calls ~3 s; safety checks are rules, not model reasoning
    gemini_api_key: str | None = None      # only for local experiments; production uses the service account
    gemini_timeout_s: float = 60
    google_cloud_project: str | None = None
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    max_upload_mb: int = 8
    travel_backend: str = "straight_line"  # straight_line | google_maps (Routes API)
    documents_bucket: str | None = None    # private bucket for uploaded credential documents
    job_audience: str | None = None        # Cloud Scheduler OIDC audience (this service's URL)
    scheduler_service_account: str | None = None
    expiry_horizon_days: int = 14


@lru_cache
def get_settings() -> Settings:
    return Settings()
