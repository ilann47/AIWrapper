import asyncio
import json
import importlib

from fastapi.testclient import TestClient
from app.aiwrapper import profiles
from app.aiwrapper.store import AIWrapperStore
from app.config import settings
from app.main import app


class FakeProcess:
    def __init__(self, payload, returncode=0):
        self.payload = payload
        self.returncode = returncode

    async def communicate(self):
        return json.dumps(self.payload).encode(), b""


def test_profile_diagnostics_executes_original_doctor_json(monkeypatch, tmp_path):
    script = tmp_path / "codex-profile"
    script.write_text("upstream executable placeholder", encoding="utf-8")
    monkeypatch.setattr(settings, "aiwrapper_profile_script", str(script))
    monkeypatch.setattr(settings, "aiwrapper_profile_bash", "bash")
    captured = {}

    async def fake_exec(*args, **kwargs):
        captured["args"] = args
        captured["env"] = kwargs["env"]
        return FakeProcess({
            "cli": {"found": True, "healthy": True, "version": "codex 1.2.3"},
            "status": {"skipped": False, "profiles": [{"name": "ilan", "state": "ok"}]},
            "workspaces": {"binding_count": 0},
        })

    monkeypatch.setattr(profiles.asyncio, "create_subprocess_exec", fake_exec)
    result = asyncio.run(profiles.profile_diagnostics())

    assert captured["args"][-2:] == ("doctor", "--json")
    assert captured["env"]["CODEX_PROFILE_NO_UPDATE_CHECK"] == "1"
    assert result["status"]["profiles"][0]["name"] == "ilan"
    assert result["commandExitCode"] == 0


def test_profile_diagnostics_endpoint_requires_administrator(monkeypatch, tmp_path):
    store_module = importlib.import_module("app.aiwrapper.store")
    auth_module = importlib.import_module("app.aiwrapper.auth")
    router_module = importlib.import_module("app.aiwrapper.router")
    local_store = AIWrapperStore(str(tmp_path / "profiles.db"))
    admin = local_store.create_user("Profile Admin", "admin", "profile-admin", str(tmp_path / ".codex-admin"))
    user = local_store.create_user("Profile User", "user", "profile-user", str(tmp_path / ".codex-user"))
    monkeypatch.setattr(store_module, "store", local_store)
    monkeypatch.setattr(auth_module, "store", local_store)
    monkeypatch.setattr(router_module, "store", local_store)

    async def fake_diagnostics():
        return {"cli": {"found": True}, "status": {"skipped": False, "profiles": []}}

    monkeypatch.setattr(router_module, "profile_diagnostics", fake_diagnostics)
    client = TestClient(app)
    allowed = client.get("/admin/profiles", headers={"Authorization": f"Bearer {admin['apiKey']['secret']}"})
    denied = client.get("/admin/profiles", headers={"Authorization": f"Bearer {user['apiKey']['secret']}"})
    assert allowed.status_code == 200
    assert allowed.json()["cli"]["found"] is True
    assert denied.status_code == 403
