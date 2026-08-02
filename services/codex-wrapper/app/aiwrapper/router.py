import re
import time
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse

from .backups import create_backup as create_database_backup, list_backups, resolve_backup
from .governance import governance
from .profiles import ensure_profile
from .store import store
from ..codex import codex_parallel_status


router = APIRouter()
public_router = APIRouter()


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
    summary_days = await governance("summary", {"userId": user["id"], "since": now_ms - 7 * 24 * 60 * 60 * 1000, "by": "day"})
    summary_outcomes = await governance("summary", {"userId": user["id"], "since": now_ms - 7 * 24 * 60 * 60 * 1000, "by": "outcome"})
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
        "tokens": summary_7d["totals"],
        "models": summary_7d["buckets"],
        "days": summary_days["buckets"],
        "outcomes": summary_outcomes["buckets"],
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


@router.get("/admin/overview")
async def admin_overview(request: Request):
    administrator(request)
    now_ms = int(time.time() * 1000)
    since_ms = now_ms - 24 * 60 * 60 * 1000
    usage = await governance("overview", {"since": since_ms, "until": now_ms})
    totals = usage.get("totals", {})
    elapsed_minutes = 24 * 60
    return {
        "counts": store.overview_counts(),
        "runtime": codex_parallel_status(),
        "usage": usage,
        "audit": store.list_audit_events(10),
        "throughputPerMinute": round(float(totals.get("requests", 0)) / elapsed_minutes, 3),
        "window": {"since": since_ms, "until": now_ms},
    }


@router.get("/admin/audit")
async def audit_events(request: Request):
    administrator(request)
    try:
        limit = int(request.query_params.get("limit", "200"))
    except ValueError as error:
        raise HTTPException(status_code=400, detail="limit must be an integer") from error
    return {"data": store.list_audit_events(limit)}


@router.get("/admin/backups")
async def database_backups(request: Request):
    administrator(request)
    return {"data": list_backups()}


@router.post("/admin/backups", status_code=201)
async def create_backup(request: Request):
    user = administrator(request)
    try:
        result = await create_database_backup()
    except (OSError, RuntimeError, KeyError) as error:
        raise HTTPException(status_code=500, detail=str(error)) from error
    store.audit_event(user["id"], "backup.created", "database_backup", result["id"], {"sizeBytes": result["sizeBytes"]})
    return result


@router.get("/admin/backups/{backup_id}")
async def download_backup(backup_id: str, request: Request):
    administrator(request)
    target = resolve_backup(backup_id)
    if not target:
        raise HTTPException(status_code=404, detail="Backup not found")
    return FileResponse(target, media_type="application/vnd.sqlite3", filename=f"aiwrapper-{backup_id}.sqlite")


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
    query = request.query_params.get("q", "")
    favorites_only = request.query_params.get("favorite", "").lower() in {"1", "true", "yes"}
    return {"data": store.list_sessions(user["id"], query, favorites_only)}


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


@router.patch("/v1/sessions/{session_id}")
async def update_session(session_id: str, request: Request):
    user = principal(request)
    result = store.update_session(user["id"], session_id, await request.json())
    if not result:
        raise HTTPException(status_code=404, detail="Session not found")
    return result


@router.get("/v1/sessions/{session_id}/export")
async def export_session(session_id: str, request: Request):
    user = principal(request)
    result = store.get_session(user["id"], session_id)
    if not result:
        raise HTTPException(status_code=404, detail="Session not found")
    if request.query_params.get("format", "markdown") == "json":
        return JSONResponse(result)
    lines = [f"# {result['session']['title']}", ""]
    for message in store.session_messages(session_id):
        lines.extend([f"## {'You' if message['role'] == 'user' else 'Codex'}", "", message["content"], ""])
    return PlainTextResponse("\n".join(lines), media_type="text/markdown", headers={
        "Content-Disposition": f"attachment; filename=aiwrapper-{session_id}.md"
    })


@router.get("/v1/shares")
async def shares(request: Request):
    user = principal(request)
    return {"data": store.list_shares(user["id"])}


@router.post("/v1/shares", status_code=201)
async def create_share(request: Request):
    user = principal(request)
    body = await request.json()
    try:
        expires = body.get("expiresInHours")
        expires_in_hours = int(expires) if expires is not None else None
        if expires_in_hours is not None and not 1 <= expires_in_hours <= 720:
            raise ValueError("expiresInHours must be between 1 and 720")
        return store.create_share(user["id"], str(body.get("sessionId", "")), expires_in_hours)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.delete("/v1/shares/{share_id}", status_code=204)
async def revoke_share(share_id: str, request: Request):
    user = principal(request)
    if not store.revoke_share(user["id"], share_id):
        raise HTTPException(status_code=404, detail="Share not found")


@public_router.get("/public/shares/{token}")
async def public_share(token: str):
    result = store.public_share(token)
    if not result:
        raise HTTPException(status_code=404, detail="Shared conversation not found or no longer available")
    return result
