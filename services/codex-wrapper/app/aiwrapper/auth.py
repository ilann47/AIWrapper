"""Browser session adapter based on OpenCodex's origin-bound GUI session design."""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Request, Response, status

from ..config import settings
from .store import store


router = APIRouter(prefix="/auth", tags=["AIWrapper authentication"])
COOKIE_NAME = "aiwrapper_refresh"


def _origin(request: Request) -> str:
    origin = (request.headers.get("origin") or "").strip().rstrip("/")
    if not origin or origin not in settings.aiwrapper_cors_origin_list:
        raise HTTPException(status_code=403, detail="Browser origin is not allowed")
    return origin


def _bearer(request: Request) -> str:
    value = request.headers.get("authorization", "")
    if not value.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Individual AIWrapper key required")
    token = value[7:].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Individual AIWrapper key required")
    return token


def _principal(user: dict[str, Any]) -> dict[str, str]:
    return {"userId": user["id"], "profileId": user["profile_name"], "role": user["role"]}


def _set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        max_age=settings.aiwrapper_refresh_session_seconds,
        httponly=True,
        secure=settings.aiwrapper_session_cookie_secure,
        samesite="strict",
        path="/auth",
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        key=COOKIE_NAME,
        httponly=True,
        secure=settings.aiwrapper_session_cookie_secure,
        samesite="strict",
        path="/auth",
    )


@router.post("/sessions", status_code=status.HTTP_201_CREATED)
async def create_session(request: Request, response: Response):
    origin = _origin(request)
    user = store.authenticate_api_key(_bearer(request))
    if not user:
        raise HTTPException(status_code=401, detail="Invalid individual AIWrapper key")
    session = store.create_auth_session(
        user["id"],
        origin,
        settings.aiwrapper_access_session_seconds,
        settings.aiwrapper_refresh_session_seconds,
    )
    _set_refresh_cookie(response, session.pop("refreshToken"))
    return {**session, "principal": _principal(user)}


@router.post("/sessions/refresh")
async def refresh_session(request: Request, response: Response):
    origin = _origin(request)
    if request.headers.get("x-aiwrapper-session") != "refresh":
        raise HTTPException(status_code=403, detail="Session refresh header required")
    refresh_token: Optional[str] = request.cookies.get(COOKIE_NAME)
    if not refresh_token:
        raise HTTPException(status_code=401, detail="No refresh session")
    session = store.refresh_auth_session(
        refresh_token,
        origin,
        settings.aiwrapper_access_session_seconds,
        settings.aiwrapper_refresh_session_seconds,
    )
    if not session:
        _clear_refresh_cookie(response)
        raise HTTPException(status_code=401, detail="Refresh session expired or revoked")
    user = store.user_by_id(session.pop("userId"))
    if not user:
        _clear_refresh_cookie(response)
        raise HTTPException(status_code=401, detail="User is disabled")
    _set_refresh_cookie(response, session.pop("refreshToken"))
    return {**session, "principal": _principal(user)}


@router.delete("/sessions/current", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(request: Request, response: Response):
    origin = _origin(request)
    user = store.authenticate(_bearer(request), origin)
    refresh_token = request.cookies.get(COOKIE_NAME)
    if user and refresh_token:
        store.revoke_auth_session(refresh_token, user["id"])
    _clear_refresh_cookie(response)
