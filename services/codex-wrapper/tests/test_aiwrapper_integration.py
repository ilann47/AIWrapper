import asyncio
import importlib
import json
import sqlite3
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

from fastapi.testclient import TestClient

from app.aiwrapper.governance import governance
from app.aiwrapper.nine_router import nine_router
from app.aiwrapper.store import AIWrapperStore
from app.config import Settings, settings
from app.main import app


def test_opencodex_is_the_default_composed_backend(monkeypatch):
    monkeypatch.delenv("AIWRAPPER_EXECUTION_BACKEND", raising=False)
    assert Settings(_env_file=None).aiwrapper_execution_backend == "opencodex"
    monkeypatch.setenv("AIWRAPPER_EXECUTION_BACKEND", "codex-cli")
    assert Settings(_env_file=None).aiwrapper_execution_backend == "codex-cli"


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
    assert store.list_audit_events(user_id=created["id"])[0]["user_id"] == created["id"]
    store.update_notification_receipts(created["id"], ["quota:5h:test"], "read")
    receipt = store.notification_receipts(created["id"], ["quota:5h:test"])["quota:5h:test"]
    assert receipt["read_at"] is not None
    assert receipt["resolved_at"] is None
    store.update_notification_receipts(created["id"], ["quota:5h:test"], "resolve")
    assert store.notification_receipts(created["id"], ["quota:5h:test"])["quota:5h:test"]["resolved_at"] is not None


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


def test_user_notification_feed_and_receipts(tmp_path, monkeypatch):
    store_module = importlib.import_module("app.aiwrapper.store")
    auth_module = importlib.import_module("app.aiwrapper.auth")
    router_module = importlib.import_module("app.aiwrapper.router")
    local_store = AIWrapperStore(str(tmp_path / "notifications.db"))
    created = local_store.create_user("Notification User", "user", "notification-user", str(tmp_path / ".codex-notifications"), 100, 100)
    local_store.audit_event(created["id"], "conversation.archived", "session", "conversation-1")
    local_store.audit_event(created["id"], "share.created", "session", "conversation-1")
    monkeypatch.setattr(store_module, "store", local_store)
    monkeypatch.setattr(auth_module, "store", local_store)
    monkeypatch.setattr(router_module, "store", local_store)
    monkeypatch.setattr(settings, "aiwrapper_cors_origins", "http://127.0.0.1:8765")

    async def fake_governance(operation, payload):
        assert operation == "summary"
        assert payload["userId"] == created["id"]
        return {"totals": {"totalTokens": 90}}

    monkeypatch.setattr(router_module, "governance", fake_governance)
    origin = "http://127.0.0.1:8765"
    client = TestClient(app)
    login = client.post("/auth/sessions", headers={"Authorization": f"Bearer {created['apiKey']['secret']}", "Origin": origin})
    headers = {"Authorization": f"Bearer {login.json()['accessToken']}", "Origin": origin}

    response = client.get("/v1/me/notifications", headers=headers)
    assert response.status_code == 200
    quota_row = next(row for row in response.json()["data"] if row["eventType"] == "quota.warning")
    assert quota_row["severity"] == "info"
    assert quota_row["readAt"] is None
    by_event = {row["eventType"]: row for row in response.json()["data"]}
    assert by_event["conversation.archived"]["source"] == "host"
    assert by_event["share.created"]["source"] == "global"

    marked = client.patch("/v1/me/notifications", headers=headers, json={"ids": [quota_row["feedId"]], "action": "read"})
    assert marked.status_code == 200
    invalid = client.patch("/v1/me/notifications", headers=headers, json={"ids": ["arbitrary:receipt"], "action": "read"})
    assert invalid.status_code == 400
    refreshed = client.get("/v1/me/notifications", headers=headers)
    refreshed_quota = next(row for row in refreshed.json()["data"] if row["feedId"] == quota_row["feedId"])
    assert refreshed_quota["readAt"] is not None


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
    original_database_path = settings.aiwrapper_database_path
    original_owner_key = settings.aiwrapper_owner_key
    settings.aiwrapper_state_dir = str(tmp_path / "state")
    settings.aiwrapper_database_path = str(tmp_path / "owner.db")
    settings.aiwrapper_owner_key = None
    try:
        local_store = AIWrapperStore(settings.aiwrapper_database_path)
        owner = local_store.list_users()[0]
        rotated = local_store.rotate_key(owner["id"])
        recovery = Path(settings.aiwrapper_state_dir) / "bootstrap-owner.key"
        assert recovery.read_text(encoding="utf-8") == rotated["secret"]
        assert local_store.authenticate(rotated["secret"])["role"] == "owner"
    finally:
        settings.aiwrapper_state_dir = original_state_dir
        settings.aiwrapper_database_path = original_database_path
        settings.aiwrapper_owner_key = original_owner_key


def test_temporary_store_cannot_overwrite_configured_owner_recovery_file(tmp_path):
    original_state_dir = settings.aiwrapper_state_dir
    original_database_path = settings.aiwrapper_database_path
    original_owner_key = settings.aiwrapper_owner_key
    settings.aiwrapper_state_dir = str(tmp_path / "canonical-state")
    settings.aiwrapper_database_path = str(tmp_path / "canonical-state" / "aiwrapper.db")
    settings.aiwrapper_owner_key = None
    try:
        canonical = AIWrapperStore(settings.aiwrapper_database_path)
        recovery = Path(settings.aiwrapper_state_dir) / "bootstrap-owner.key"
        canonical_secret = recovery.read_text(encoding="utf-8")
        assert canonical.authenticate(canonical_secret)["role"] == "owner"

        temporary_database = tmp_path / "test-fixture" / "fixture.db"
        fixture = AIWrapperStore(str(temporary_database))
        assert recovery.read_text(encoding="utf-8") == canonical_secret
        fixture_secret = (temporary_database.parent / "bootstrap-owner.key").read_text(encoding="utf-8")
        assert fixture.authenticate(fixture_secret)["role"] == "owner"
        assert canonical.authenticate(fixture_secret) is None
    finally:
        settings.aiwrapper_state_dir = original_state_dir
        settings.aiwrapper_database_path = original_database_path
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
        monitor = await governance("monitor", {})
        return summary, overview, decision, monitor

    try:
        summary, overview, decision, monitor = asyncio.run(scenario())
    finally:
        settings.aiwrapper_governance_bridge = original_bridge
        settings.aiwrapper_multi_auth_dir = original_dir

    assert summary["totals"]["totalTokens"] == 12
    assert summary["totals"]["reasoningTokens"] == 2
    assert overview["latency"] == {"averageMs": 125, "p95Ms": 125, "measuredRequests": 1}
    assert decision["allowed"] is False
    assert monitor["command"] == "monitor"
    assert monitor["accounts"] == {"count": 0, "policyCount": 0}
    assert monitor["modelMatrix"]["models"]
    assert monitor["usage"]["totals"]["requests"] == 1


def test_multi_auth_monitor_endpoint_is_administrator_only(tmp_path, monkeypatch):
    repository = Path(__file__).resolve().parents[3]
    store_module = importlib.import_module("app.aiwrapper.store")
    auth_module = importlib.import_module("app.aiwrapper.auth")
    router_module = importlib.import_module("app.aiwrapper.router")
    local_store = AIWrapperStore(str(tmp_path / "monitor.db"))
    admin = local_store.create_user("Monitor Admin", "admin", "monitor-admin", str(tmp_path / ".codex-admin"))
    regular = local_store.create_user("Monitor User", "user", "monitor-user", str(tmp_path / ".codex-user"))
    monkeypatch.setattr(store_module, "store", local_store)
    monkeypatch.setattr(auth_module, "store", local_store)
    monkeypatch.setattr(router_module, "store", local_store)
    monkeypatch.setattr(settings, "aiwrapper_governance_bridge", str(repository / "extensions" / "aiwrapper-admin" / "src" / "governance-bridge.mjs"))
    monkeypatch.setattr(settings, "aiwrapper_multi_auth_dir", str(tmp_path / "multi-auth"))
    monkeypatch.setattr(settings, "aiwrapper_cors_origins", "http://127.0.0.1:8765")

    origin = "http://127.0.0.1:8765"
    client = TestClient(app)
    admin_login = client.post("/auth/sessions", headers={"Authorization": f"Bearer {admin['apiKey']['secret']}", "Origin": origin})
    admin_headers = {"Authorization": f"Bearer {admin_login.json()['accessToken']}", "Origin": origin}
    response = client.get("/admin/multi-auth/monitor", headers=admin_headers)
    assert response.status_code == 200
    assert response.json()["command"] == "monitor"
    assert response.json()["accounts"] == {"count": 0, "policyCount": 0}

    user_login = client.post("/auth/sessions", headers={"Authorization": f"Bearer {regular['apiKey']['secret']}", "Origin": origin})
    user_headers = {"Authorization": f"Bearer {user_login.json()['accessToken']}", "Origin": origin}
    assert client.get("/admin/multi-auth/monitor", headers=user_headers).status_code == 403


def test_nine_router_bridge_executes_upstream_rtk(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "aiwrapper_database_path", str(tmp_path / "rtk.sqlite"))
    noisy_log = "\n".join([f"src/file.py:{line}: repeated diagnostic payload" for line in range(1, 160)])
    result = asyncio.run(nine_router("compress", {
        "body": {"messages": [{"role": "tool", "content": noisy_log}]},
        "enabled": True,
    }))

    assert result["stats"]["bytesAfter"] < result["stats"]["bytesBefore"]
    assert len(result["body"]["messages"][0]["content"]) < len(noisy_log)


def test_nine_router_settings_repo_persists_and_controls_rtk(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "aiwrapper_database_path", str(tmp_path / "settings.sqlite"))
    initial = asyncio.run(nine_router("settings:get", {}))
    assert initial["rtkEnabled"] is True

    updated = asyncio.run(nine_router("settings:update", {"updates": {"rtkEnabled": False}}))
    disabled = asyncio.run(nine_router("compress", {
        "body": {"messages": [{"role": "tool", "content": "x" * 5000}]},
        "enabled": True,
    }))
    assert updated["rtkEnabled"] is False
    assert disabled["stats"] is None
    assert asyncio.run(nine_router("settings:get", {}))["rtkEnabled"] is False


def test_nine_router_executes_upstream_caveman_and_ponytail_injectors(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "aiwrapper_database_path", str(tmp_path / "prompt-savers.sqlite"))
    asyncio.run(nine_router("settings:update", {"updates": {
        "cavemanEnabled": True,
        "cavemanLevel": "lite",
        "ponytailEnabled": True,
        "ponytailLevel": "full",
    }}))

    result = asyncio.run(nine_router("compress", {
        "body": {"messages": [{"role": "user", "content": "Build a parser"}]},
        "enabled": False,
    }))
    system = result["body"]["messages"][0]
    assert system["role"] == "system"
    assert "Respond tersely" in system["content"]
    assert "lazy senior developer" in system["content"]
    assert result["transforms"] == ["CAVEMAN:lite", "PONYTAIL:full"]


def test_nine_router_executes_upstream_headroom_compressor_and_health_probe(tmp_path, monkeypatch):
    class HeadroomHandler(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            return

        def do_GET(self):
            self.send_response(200 if self.path == "/health" else 404)
            self.end_headers()

        def do_POST(self):
            size = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(size))
            response = {
                "messages": [{**message, "content": "compressed by headroom"} for message in payload["messages"]],
                "tokens_before": 100,
                "tokens_after": 25,
                "tokens_saved": 75,
            }
            body = json.dumps(response).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    server = ThreadingHTTPServer(("127.0.0.1", 0), HeadroomHandler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    url = f"http://127.0.0.1:{server.server_port}"
    try:
        monkeypatch.setattr(settings, "aiwrapper_database_path", str(tmp_path / "headroom.sqlite"))
        asyncio.run(nine_router("settings:update", {"updates": {"headroomEnabled": True, "headroomUrl": url}}))
        result = asyncio.run(nine_router("compress", {
            "body": {"messages": [{"role": "user", "content": "large context"}]},
            "model": "gpt-test",
            "enabled": False,
        }))
        status = asyncio.run(nine_router("headroom:status", {}))
    finally:
        server.shutdown()
        server.server_close()

    assert result["body"]["messages"][0]["content"] == "compressed by headroom"
    assert result["headroom"]["stats"]["tokens_saved"] == 75
    assert status == {"url": url, "running": True}


def test_administrator_can_update_token_saver_setting(tmp_path, monkeypatch):
    store_module = importlib.import_module("app.aiwrapper.store")
    auth_module = importlib.import_module("app.aiwrapper.auth")
    router_module = importlib.import_module("app.aiwrapper.router")
    database = tmp_path / "token-saver.sqlite"
    local_store = AIWrapperStore(str(database))
    administrator = local_store.create_user("RTK Admin", "admin", "rtk-admin", str(tmp_path / ".codex-admin"))
    regular_user = local_store.create_user("RTK User", "user", "rtk-user", str(tmp_path / ".codex-user"))
    monkeypatch.setattr(store_module, "store", local_store)
    monkeypatch.setattr(auth_module, "store", local_store)
    monkeypatch.setattr(router_module, "store", local_store)
    monkeypatch.setattr(settings, "aiwrapper_database_path", str(database))
    monkeypatch.setattr(settings, "aiwrapper_rtk_enabled", True)
    monkeypatch.setattr(settings, "aiwrapper_cors_origins", "http://127.0.0.1:8765")

    origin = "http://127.0.0.1:8765"
    client = TestClient(app)
    login = client.post("/auth/sessions", headers={"Authorization": f"Bearer {administrator['apiKey']['secret']}", "Origin": origin})
    headers = {"Authorization": f"Bearer {login.json()['accessToken']}", "Origin": origin}

    assert client.get("/admin/token-saver", headers=headers).json()["effectiveEnabled"] is True
    updated = client.patch("/admin/token-saver", headers=headers, json={"rtkEnabled": False})
    assert updated.status_code == 200
    assert updated.json() == {
        "rtkEnabled": False,
        "environmentEnabled": True,
        "effectiveEnabled": False,
        "cavemanEnabled": False,
        "cavemanLevel": "full",
        "ponytailEnabled": False,
        "ponytailLevel": "full",
        "headroomEnabled": False,
        "headroomUrl": "http://localhost:8787",
        "headroomCompressUserMessages": False,
    }
    assert local_store.list_audit_events()[0]["action"] == "token_saver.updated"

    prompts = client.patch("/admin/token-saver", headers=headers, json={
        "cavemanEnabled": True,
        "cavemanLevel": "ultra",
        "ponytailEnabled": True,
        "ponytailLevel": "lite",
    })
    assert prompts.status_code == 200
    assert prompts.json()["cavemanLevel"] == "ultra"
    assert prompts.json()["ponytailEnabled"] is True
    assert client.patch("/admin/token-saver", headers=headers, json={"cavemanLevel": "invalid"}).status_code == 400
    assert client.patch("/admin/token-saver", headers=headers, json={"headroomUrl": "file:///etc/passwd"}).status_code == 400

    user_login = client.post("/auth/sessions", headers={"Authorization": f"Bearer {regular_user['apiKey']['secret']}", "Origin": origin})
    user_headers = {"Authorization": f"Bearer {user_login.json()['accessToken']}", "Origin": origin}
    assert client.get("/admin/token-saver", headers=user_headers).status_code == 403
    assert client.get("/admin/token-saver/headroom-status", headers=user_headers).status_code == 403


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
