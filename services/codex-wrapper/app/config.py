import os
from typing import Optional

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    proxy_api_key: Optional[str] = Field(default=None, alias="PROXY_API_KEY")
    # Docker ビルドで使用するホスト UID/GID。アプリ本体では未使用だが、.env の互換性維持のため受理する。
    host_uid: Optional[int] = Field(default=None, alias="HOST_UID")
    host_gid: Optional[int] = Field(default=None, alias="HOST_GID")
    codex_workdir: str = Field(default="/workspace", alias="CODEX_WORKDIR")
    codex_config_dir: Optional[str] = Field(default=None, alias="CODEX_CONFIG_DIR")
    codex_profile_dir: Optional[str] = Field(
        default=None, alias="CODEX_WRAPPER_PROFILE_DIR"
    )
    codex_path: str = Field(default="codex", alias="CODEX_PATH")
    codex_node_path: Optional[str] = Field(default=None, alias="CODEX_NODE_PATH")
    sandbox_mode: str = Field(default="read-only", alias="CODEX_SANDBOX_MODE")
    workspace_network_access: bool = Field(
        default=False, alias="CODEX_WORKSPACE_NETWORK_ACCESS"
    )
    reasoning_effort: str = Field(default="medium", alias="CODEX_REASONING_EFFORT")
    local_only: bool = Field(default=False, alias="CODEX_LOCAL_ONLY")
    timeout_seconds: int = Field(default=120, alias="CODEX_TIMEOUT")
    max_parallel_requests: int = Field(
        default=2, alias="CODEX_MAX_PARALLEL_REQUESTS"
    )
    rate_limit_per_minute: int = Field(default=60, alias="RATE_LIMIT_PER_MINUTE")
    hide_reasoning: bool = Field(default=False, alias="CODEX_HIDE_REASONING")
    # Allow server to honor x_codex.sandbox == "danger-full-access" requests.
    # When false, such requests are blocked if received (unless CODEX_LOCAL_ONLY is also false
    # in older behavior). Prefer enabling this explicitly for safety.
    allow_danger_full_access: bool = Field(default=False, alias="CODEX_ALLOW_DANGER_FULL_ACCESS")
    # Deprecated: ignored, but kept to avoid startup failures when legacy env remains.
    codex_model: Optional[str] = Field(default=None, alias="CODEX_MODEL")
    aiwrapper_enabled: bool = Field(default=True, alias="AIWRAPPER_ENABLED")
    aiwrapper_state_dir: str = Field(default=".aiwrapper", alias="AIWRAPPER_STATE_DIR")
    aiwrapper_database_path: str = Field(default=".aiwrapper/aiwrapper.db", alias="AIWRAPPER_DATABASE_PATH")
    aiwrapper_multi_auth_dir: str = Field(default=".aiwrapper/multi-auth", alias="AIWRAPPER_MULTI_AUTH_DIR")
    aiwrapper_governance_bridge: str = Field(default="../../extensions/aiwrapper-admin/src/governance-bridge.mjs", alias="AIWRAPPER_GOVERNANCE_BRIDGE")
    aiwrapper_nine_router_bridge: str = Field(default="../../extensions/aiwrapper-runtime/src/nine-router-bridge.mjs", alias="AIWRAPPER_NINE_ROUTER_BRIDGE")
    aiwrapper_rtk_enabled: bool = Field(default=True, alias="AIWRAPPER_RTK_ENABLED")
    # OpenCodex is the canonical data plane for the composed product. Keep the
    # original Codex-Wrapper CLI path available only as an explicit fallback.
    aiwrapper_execution_backend: str = Field(default="opencodex", alias="AIWRAPPER_EXECUTION_BACKEND")
    aiwrapper_opencodex_base_url: str = Field(default="http://127.0.0.1:8765", alias="AIWRAPPER_OPENCODEX_BASE_URL")
    aiwrapper_opencodex_api_key: Optional[str] = Field(default=None, alias="AIWRAPPER_OPENCODEX_API_KEY")
    aiwrapper_opencodex_default_model: str = Field(default="gpt-5", alias="AIWRAPPER_OPENCODEX_DEFAULT_MODEL")
    aiwrapper_cors_origins: str = Field(
        default="http://127.0.0.1:8765,http://localhost:8765,http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:5174,http://localhost:5174",
        alias="AIWRAPPER_CORS_ORIGINS",
    )
    aiwrapper_node_path: str = Field(default="node", alias="AIWRAPPER_NODE_PATH")
    aiwrapper_profile_script: str = Field(default="../../packages/codex-profiles/bin/codex-profile", alias="AIWRAPPER_PROFILE_SCRIPT")
    aiwrapper_profile_bash: str = Field(default=r"C:\Program Files\Git\bin\bash.exe", alias="AIWRAPPER_PROFILE_BASH")
    aiwrapper_owner_name: str = Field(default="owner", alias="AIWRAPPER_OWNER_NAME")
    aiwrapper_owner_key: Optional[str] = Field(default=None, alias="AIWRAPPER_OWNER_KEY")
    aiwrapper_public_base_url: str = Field(default="http://127.0.0.1:8766", alias="AIWRAPPER_PUBLIC_BASE_URL")
    aiwrapper_web_base_url: str = Field(default="http://127.0.0.1:8765", alias="AIWRAPPER_WEB_BASE_URL")
    aiwrapper_access_session_seconds: int = Field(default=300, alias="AIWRAPPER_ACCESS_SESSION_SECONDS")
    aiwrapper_refresh_session_seconds: int = Field(default=2592000, alias="AIWRAPPER_REFRESH_SESSION_SECONDS")
    aiwrapper_session_cookie_secure: bool = Field(default=False, alias="AIWRAPPER_SESSION_COOKIE_SECURE")

    @property
    def aiwrapper_cors_origin_list(self) -> list[str]:
        return [origin.strip().rstrip("/") for origin in self.aiwrapper_cors_origins.split(",") if origin.strip()]

    # Default to loading from ".env". You can override the path by
    # passing `_env_file` when instantiating `Settings` (see bottom).
    model_config = SettingsConfigDict(case_sensitive=False, env_file=".env")

# Allow overriding env file path via process env `CODEX_ENV_FILE`.
# Note: this variable must be set in the OS/process environment (not inside .env),
# because it controls which .env file to read.
_ENV_FILE = os.getenv("CODEX_ENV_FILE") or ".env"

# Instantiate settings, optionally pointing to a custom env file.
settings = Settings(_env_file=_ENV_FILE)
