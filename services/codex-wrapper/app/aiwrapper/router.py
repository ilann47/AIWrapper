import re
from typing import Any

from fastapi import APIRouter, HTTPException, Request

from .governance import governance
from .profiles import ensure_profile
from .store import store


router = APIRouter()


def principal(request: Request) -> dict[str, Any]:
    value = getattr(request.state, "aiwrapper_principal", None)
    if not value:
        raise HTTPException(status_code=401, detail="Individual AIWrapper key required")
    return value


def administrator(request: Request) -> dict[str, Any]:
    value = principal(request)
    if value["role"] not in {"admin", "owner"}:
        raise HTTPException(status_code=403, detail="Administrator role required")
    return value


@router.get("/v1/me")
async def me(request: Request):
    user = principal(request)
    return {"userId": user["id"], "profileId": user["profile_name"], "role": user["role"]}


@router.get("/v1/me/usage")
async def my_usage(request: Request):
    user = principal(request)
    now_ms = int(__import__("time").time() * 1000)
    summary_5h = await governance("summary", {"userId": user["id"], "since": now_ms - 5 * 60 * 60 * 1000})
    summary_7d = await governance("summary", {"userId": user["id"], "since": now_ms - 7 * 24 * 60 * 60 * 1000})
    used_5h, used_7d = summary_5h["totals"]["totalTokens"], summary_7d["totals"]["totalTokens"]
    return {
        "weighted_units": used_7d,
        "request_count": summary_7d["totals"]["requests"],
        "quota_percent": 100,
        "used_percent": round(max(used_5h / user["quota_5h"], used_7d / user["quota_7d"]) * 100, 2),
        "windows": {
            "5h": {"used": used_5h, "limit": user["quota_5h"]},
            "7d": {"used": used_7d, "limit": user["quota_7d"]},
        },
    }


@router.get("/admin/users")
async def users(request: Request):
    administrator(request)
    data = []
    for user in store.list_users():
        summary = await governance("summary", {"userId": user["id"]})
        data.append({
            **{key: value for key, value in user.items() if key != "api_key_hash"},
            "profile_id": user["profile_name"],
            "backend_id": "codex-wrapper",
            "weighted_units": summary["totals"]["totalTokens"],
        })
    return {"data": data}


@router.post("/admin/users", status_code=201)
async def create_user(request: Request):
    administrator(request)
    body = await request.json()
    name = str(body.get("name", "")).strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")
    profile_name = re.sub(r"[^a-z0-9-]+", "-", name.lower()).strip("-")
    try:
        codex_home = await ensure_profile(profile_name)
        return store.create_user(
            name,
            str(body.get("role", "user")),
            profile_name,
            codex_home,
            int(body.get("quota5h", body.get("quota_5h", 100000))),
            int(body.get("quota7d", body.get("quota_7d", 500000))),
        )
    except (RuntimeError, ValueError) as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.patch("/admin/users/{user_id}")
async def update_user(user_id: str, request: Request):
    administrator(request)
    body = await request.json()
    user = store.update_user(user_id, body)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {key: value for key, value in user.items() if key != "api_key_hash"}


@router.patch("/admin/users/{user_id}/status", status_code=204)
async def update_user_status(user_id: str, request: Request):
    administrator(request)
    body = await request.json()
    if not store.update_user(user_id, {"status": body.get("status")}):
        raise HTTPException(status_code=404, detail="User not found")


@router.post("/admin/users/{user_id}/keys", status_code=201)
async def rotate_user_key(user_id: str, request: Request):
    administrator(request)
    try:
        return store.rotate_key(user_id)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.get("/admin/organizations")
async def organizations(request: Request):
    administrator(request)
    return {"data": store.list_organizations()}


@router.post("/admin/organizations", status_code=201)
async def create_organization(request: Request):
    administrator(request)
    body = await request.json()
    name = str(body.get("name", "")).strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")
    return store.create_organization(name)


@router.get("/v1/sessions")
async def sessions(request: Request):
    user = principal(request)
    return {"data": store.list_sessions(user["id"])}


@router.get("/v1/sessions/{session_id}")
async def get_session(session_id: str, request: Request):
    user = principal(request)
    result = store.get_session(user["id"], session_id)
    if not result:
        raise HTTPException(status_code=404, detail="Session not found")
    return result


@router.delete("/v1/sessions/{session_id}", status_code=204)
async def archive_session(session_id: str, request: Request):
    user = principal(request)
    store.archive_session(user["id"], session_id)


@router.get("/v1/shares")
async def shares(request: Request):
    user = principal(request)
    return {"data": store.list_shares(user["id"])}


@router.post("/v1/shares", status_code=201)
async def create_share(request: Request):
    user = principal(request)
    body = await request.json()
    try:
        return store.create_share(user["id"], str(body.get("sessionId", "")))
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
