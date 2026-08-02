import asyncio
from pathlib import Path

from app.aiwrapper.governance import governance
from app.aiwrapper.nine_router import nine_router
from app.aiwrapper.store import AIWrapperStore
from app.config import settings


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
        await governance("append", {"userId": "user-1", "outcome": "success", "model": "codex-cli", "inputTokens": 7, "outputTokens": 3})
        summary = await governance("summary", {"userId": "user-1"})
        decision = await governance("evaluate", {"userId": "user-1", "maxTokens": 10, "window": "hour"})
        return summary, decision

    try:
        summary, decision = asyncio.run(scenario())
    finally:
        settings.aiwrapper_governance_bridge = original_bridge
        settings.aiwrapper_multi_auth_dir = original_dir

    assert summary["totals"]["totalTokens"] == 10
    assert decision["allowed"] is False


def test_nine_router_bridge_executes_upstream_rtk():
    noisy_log = "\n".join([f"src/file.py:{line}: repeated diagnostic payload" for line in range(1, 160)])
    result = asyncio.run(nine_router("compress", {
        "body": {"messages": [{"role": "tool", "content": noisy_log}]},
        "enabled": True,
    }))

    assert result["stats"]["bytesAfter"] < result["stats"]["bytesBefore"]
    assert len(result["body"]["messages"][0]["content"]) < len(noisy_log)
