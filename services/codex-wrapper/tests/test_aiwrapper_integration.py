import asyncio
import importlib
import sqlite3
from pathlib import Path

from fastapi.testclient import TestClient

from app.aiwrapper.governance import governance
from app.aiwrapper.nine_router import nine_router
from app.aiwrapper.store import AIWrapperStore
from app.config import settings
from app.main import app


def test_aiwrapper_store_users_sessions_organizations_and_shares(tmp_path):
    database = tmp_path / "aiwrapper.db"
    store = AIWrapperStore(str(database))
    created = store.create_user("Lab User", "user", "lab-user", str(tmp_path / ".codex-lab"), 100, 500)

    assert store.authenticate(created["apiKey"]["secret"])["name"] == "Lab User"
    session = store.session(created["id"], None, "codex-cli", "hello")
    store.append_assistant(session["id"], "world")
    detail = store.get_session(created["id"], session["id"])
    assert [turn["items"][0]["type"] for turn in detail["thread"]["turns"]] == ["userMessage", "agentMessage"]
    updated = store.update_session(created["id"], session["id"], {"title": "Pinned chat", "favorite": True})
    assert updated["title"] == "Pinned chat"
    assert updated["favorite"] is True
    assert [row["id"] for row in store.list_sessions(created["id"], "Pinned", True)] == [session["id"]]

    organization = store.create_organization("Lab")
    assert organization["name"] == "Lab"
    share = store.create_share(created["id"], session["id"])
    assert share["sessionId"] == session["id"]
    share_token = share["url"].split("/#shared/", 1)[1]
    assert store.public_share(share_token)["messages"][-1]["content"] == "world"
    assert share_token not in database.read_bytes().decode("utf-8", errors="ignore")
    assert store.revoke_share(created["id"], share["id"]) is True
    assert store.public_share(share_token) is None

    auth = store.create_auth_session(created["id"], "http://127.0.0.1:8765", 300, 3600)
    assert store.authenticate(auth["accessToken"], "http://127.0.0.1:8765")["id"] == created["id"]
    assert store.authenticate(auth["accessToken"], "https://attacker.invalid") is None
    refreshed = store.refresh_auth_session(auth["refreshToken"], "http://127.0.0.1:8765", 300, 3600)
    assert refreshed and refreshed["accessToken"] != auth["accessToken"]
    assert store.authenticate(auth["accessToken"], "http://127.0.0.1:8765") is None
    assert store.list_audit_events()[0]["action"] == "auth.session.refreshed"


def test_browser_session_and_public_share_end_to_end(tmp_path, monkeypatch):
    store_module = importlib.import_module("app.aiwrapper.store")
    auth_module = importlib.import_module("app.aiwrapper.auth")
    router_module = importlib.import_module("app.aiwrapper.router")
    local_store = AIWrapperStore(str(tmp_path / "flow.db"))
    created = local_store.create_user("Browser User", "user", "browser-user", str(tmp_path / ".codex-browser"), 100, 500)
    conversation = local_store.session(created["id"], None, "gpt-5", "hello")
    local_store.append_assistant(conversation["id"], "world")
    monkeypatch.setattr(store_module, "store", local_store)
    monkeypatch.setattr(auth_module, "store", local_store)
    monkeypatch.setattr(router_module, "store", local_store)
    monkeypatch.setattr(settings, "aiwrapper_cors_origins", "http://127.0.0.1:8765")

    origin = "http://127.0.0.1:8765"
    client = TestClient(app)
    login = client.post("/auth/sessions", headers={"Authorization": f"Bearer {created['apiKey']['secret']}", "Origin": origin})
    assert login.status_code == 201
    access = login.json()["accessToken"]
    assert access.startswith("aiw_session_")
    assert "HttpOnly" in login.headers["set-cookie"]
    assert "SameSite=strict" in login.headers["set-cookie"]

    me = client.get("/v1/me", headers={"Authorization": f"Bearer {access}", "Origin": origin})
    assert me.status_code == 200
    assert me.json()["userId"] == created["id"]

    refresh = client.post("/auth/sessions/refresh", headers={"Origin": origin, "X-AIWrapper-Session": "refresh"})
    assert refresh.status_code == 200
    refreshed_access = refresh.json()["accessToken"]
    assert refreshed_access != access

    share = client.post(
        "/v1/shares",
        headers={"Authorization": f"Bearer {refreshed_access}", "Origin": origin},
        json={"sessionId": conversation["id"], "expiresInHours": 24},
    )
    assert share.status_code == 201
    share_token = share.json()["url"].split("/#shared/", 1)[1]
    public = client.get(f"/public/shares/{share_token}")
    assert public.status_code == 200
    assert [row["content"] for row in public.json()["messages"]] == ["hello", "world"]

    revoked = client.delete(
        f"/v1/shares/{share.json()['id']}",
        headers={"Authorization": f"Bearer {refreshed_access}", "Origin": origin},
    )
    assert revoked.status_code == 204
    assert client.get(f"/public/shares/{share_token}").status_code == 404


def test_administrator_can_create_list_and_download_database_backup(tmp_path, monkeypatch):
    store_module = importlib.import_module("app.aiwrapper.store")
    auth_module = importlib.import_module("app.aiwrapper.auth")
    router_module = importlib.import_module("app.aiwrapper.router")
    database = tmp_path / "platform.sqlite"
    local_store = AIWrapperStore(str(database))
    administrator = local_store.create_user("Backup Admin", "admin", "backup-admin", str(tmp_path / ".codex-admin"))
    monkeypatch.setattr(store_module, "store", local_store)
    monkeypatch.setattr(auth_module, "store", local_store)
    monkeypatch.setattr(router_module, "store", local_store)
    monkeypatch.setattr(settings, "aiwrapper_database_path", str(database))
    monkeypatch.setattr(settings, "aiwrapper_state_dir", str(tmp_path / "state"))
    monkeypatch.setattr(settings, "aiwrapper_cors_origins", "http://127.0.0.1:8765")

    origin = "http://127.0.0.1:8765"
    client = TestClient(app)
    login = client.post("/auth/sessions", headers={"Authorization": f"Bearer {administrator['apiKey']['secret']}", "Origin": origin})
    headers = {"Authorization": f"Bearer {login.json()['accessToken']}", "Origin": origin}

    created = client.post("/admin/backups", headers=headers)
    assert created.status_code == 201
    backup_id = created.json()["id"]
    listed = client.get("/admin/backups", headers=headers)
    assert listed.status_code == 200
    assert listed.json()["data"][0]["id"] == backup_id
    downloaded = client.get(f"/admin/backups/{backup_id}", headers=headers)
    assert downloaded.status_code == 200
    assert downloaded.headers["content-type"].startswith("application/vnd.sqlite3")
    assert local_store.list_audit_events()[0]["action"] == "backup.created"


def test_rotating_owner_key_updates_the_local_recovery_file(tmp_path):
    original_state_dir = settings.aiwrapper_state_dir
    original_owner_key = settings.aiwrapper_owner_key
    settings.aiwrapper_state_dir = str(tmp_path / "state")
    settings.aiwrapper_owner_key = None
    try:
        local_store = AIWrapperStore(str(tmp_path / "owner.db"))
        owner = local_store.list_users()[0]
        rotated = local_store.rotate_key(owner["id"])
        recovery = Path(settings.aiwrapper_state_dir) / "bootstrap-owner.key"
        assert recovery.read_text(encoding="utf-8") == rotated["secret"]
        assert local_store.authenticate(rotated["secret"])["role"] == "owner"
    finally:
        settings.aiwrapper_state_dir = original_state_dir
        settings.aiwrapper_owner_key = original_owner_key


def test_governance_bridge_executes_upstream_ledger_and_budget(tmp_path):
    repository = Path(__file__).resolve().parents[3]
    original_bridge = settings.aiwrapper_governance_bridge
    original_dir = settings.aiwrapper_multi_auth_dir
    settings.aiwrapper_governance_bridge = str(repository / "extensions" / "aiwrapper-admin" / "src" / "governance-bridge.mjs")
    settings.aiwrapper_multi_auth_dir = str(tmp_path / "multi-auth")

    async def scenario():
        await governance("append", {
            "userId": "user-1",
            "outcome": "success",
            "model": "codex-cli",
            "inputTokens": 7,
            "outputTokens": 3,
            "reasoningTokens": 2,
            "durationMs": 125,
        })
        summary = await governance("summary", {"userId": "user-1"})
        overview = await governance("overview", {})
        decision = await governance("evaluate", {"userId": "user-1", "maxTokens": 10, "window": "hour"})
        return summary, overview, decision

    try:
        summary, overview, decision = asyncio.run(scenario())
    finally:
        settings.aiwrapper_governance_bridge = original_bridge
        settings.aiwrapper_multi_auth_dir = original_dir

    assert summary["totals"]["totalTokens"] == 12
    assert summary["totals"]["reasoningTokens"] == 2
    assert overview["latency"] == {"averageMs": 125, "p95Ms": 125, "measuredRequests": 1}
    assert decision["allowed"] is False


def test_nine_router_bridge_executes_upstream_rtk():
    noisy_log = "\n".join([f"src/file.py:{line}: repeated diagnostic payload" for line in range(1, 160)])
    result = asyncio.run(nine_router("compress", {
        "body": {"messages": [{"role": "tool", "content": noisy_log}]},
        "enabled": True,
    }))

    assert result["stats"]["bytesAfter"] < result["stats"]["bytesBefore"]
    assert len(result["body"]["messages"][0]["content"]) < len(noisy_log)


def test_nine_router_backup_preserves_schema_and_data(tmp_path):
    database = tmp_path / "source.sqlite"
    with sqlite3.connect(database) as connection:
        connection.execute("CREATE TABLE example (id INTEGER PRIMARY KEY, value TEXT NOT NULL)")
        connection.execute("INSERT INTO example(value) VALUES ('preserved')")

    result = asyncio.run(nine_router("backup", {
        "databasePath": str(database),
        "label": "test",
    }, {"AIWRAPPER_BACKUPS_DIR": str(tmp_path / "backups")}))

    backup = Path(result["backupPath"])
    assert backup.is_file()
    with sqlite3.connect(backup) as connection:
        assert connection.execute("SELECT value FROM example").fetchone()[0] == "preserved"
