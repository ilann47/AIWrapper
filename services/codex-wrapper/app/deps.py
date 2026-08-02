import asyncio
import time
from typing import Optional

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import settings


security = HTTPBearer(auto_error=False)
_rate_lock = asyncio.Lock()
_rate_data = {}


async def verify_api_key(request: Request, credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)) -> None:
    """Verify bearer token if PROXY_API_KEY is set."""
    if settings.aiwrapper_enabled:
        from .aiwrapper.store import store
        token = credentials.credentials if credentials else ""
        principal = store.authenticate(token, request.headers.get("origin")) if token else None
        if not principal and settings.proxy_api_key and token == settings.proxy_api_key:
            principal = next((user for user in store.list_users() if user["role"] == "owner"), None)
        if not principal:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid individual AIWrapper key")
        request.state.aiwrapper_principal = principal
        return
    if settings.proxy_api_key:
        if not credentials or credentials.credentials != settings.proxy_api_key:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")


async def rate_limiter(request: Request) -> None:
    """Simple in-memory rate limiter per IP address."""
    if settings.rate_limit_per_minute <= 0:
        return

    principal = getattr(request.state, "aiwrapper_principal", None)
    identity = f"user:{principal['id']}" if principal else f"ip:{request.client.host if request.client else 'anonymous'}"
    now = time.time()
    window = 60
    async with _rate_lock:
        count, reset = _rate_data.get(identity, (0, now + window))
        if reset < now:
            count, reset = 0, now + window
        if count >= settings.rate_limit_per_minute:
            raise HTTPException(status_code=429, detail="Rate limit exceeded")
        _rate_data[identity] = (count + 1, reset)
