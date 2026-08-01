from pathlib import Path

from fastapi.testclient import TestClient
from app.main import app


def setup_function():
    path = Path("data/test.db")
    if path.exists():
        path.unlink()


def test_user_chat_and_usage():
    with TestClient(app) as client:
        created = client.post("/admin/users", headers={"Authorization": "Bearer test-admin"}, json={"name": "ilan", "primary_limit": 1000, "secondary_limit": 5000, "rpm": 10})
        assert created.status_code == 200
        key = created.json()["api_key"]
        response = client.post("/v1/chat/completions", headers={"Authorization": f"Bearer {key}"}, json={"model": "lab-model", "messages": [{"role": "user", "content": "Olá"}]})
        assert response.status_code == 200
        assert response.json()["usage"]["weighted_units"] > 0
        assert response.json()["timing"]["processing_ms"] >= 0
        usage = client.get("/v1/me/usage", headers={"Authorization": f"Bearer {key}"}).json()
        assert usage["primary"]["used_units"] > 0


def test_invalid_key_is_rejected():
    with TestClient(app) as client:
        assert client.get("/v1/me/usage", headers={"Authorization": "Bearer nope"}).status_code == 401


def test_persistent_session_history():
    with TestClient(app) as client:
        created = client.post("/admin/users", headers={"Authorization": "Bearer test-admin"}, json={"name": "session-user", "primary_limit": 10000, "secondary_limit": 50000, "rpm": 10})
        key = created.json()["api_key"]
        headers = {"Authorization": f"Bearer {key}"}
        session = client.post("/v1/sessions", headers=headers, json={"title": "Meu chat", "model": "lab-model", "reasoning_effort": "low"}).json()
        response = client.post(f"/v1/sessions/{session['id']}/messages", headers=headers, json={"content": "Olá", "model": "lab-model", "reasoning_effort": "low", "speed": "standard"})
        assert response.status_code == 200
        detail = client.get(f"/v1/sessions/{session['id']}", headers=headers).json()
        assert [m["role"] for m in detail["messages"]] == ["user", "assistant"]
        assert len(client.get("/v1/sessions", headers=headers).json()) == 1


def test_admin_can_update_existing_user_limits():
    with TestClient(app) as client:
        created = client.post("/admin/users", headers={"Authorization": "Bearer test-admin"}, json={"name": "quota-user", "primary_limit": 1000, "secondary_limit": 5000, "rpm": 10}).json()
        user_id = created["user"]["id"]
        updated = client.patch(f"/admin/users/{user_id}", headers={"Authorization": "Bearer test-admin"}, json={"primary_limit": 2000, "secondary_limit": 9000, "rpm": 25})
        assert updated.status_code == 200
        assert updated.json()["primary_limit"] == 2000
        assert updated.json()["rpm"] == 25
