from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="AIWRAPPER_", env_file=".env")
    database: str = "data/aiwrapper.db"
    admin_key: str = "dev-admin-key"
    local_admin_no_key: bool = True
    backend: str = "mock"
    upstream_base_url: str = "https://api.openai.com/v1"
    upstream_api_key: str = ""
    codex_path: str = "codex"
    codex_model: str = ""
    codex_workdir: str = "."
    codex_timeout: int = 300
    default_primary_limit: int = 100_000
    default_secondary_limit: int = 500_000

    def ensure_paths(self) -> None:
        Path(self.database).parent.mkdir(parents=True, exist_ok=True)


settings = Settings()
