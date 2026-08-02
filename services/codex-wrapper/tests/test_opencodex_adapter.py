import asyncio
import json

import httpx
from fastapi.testclient import TestClient

from app.aiwrapper.opencodex import (
    complete_with_opencodex,
    list_opencodex_models,
    opencodex_health,
    stream_with_opencodex,
)
from app.config import settings
from app.main import app


def client_factory(handler):
    def create():
        return httpx.AsyncClient(
            base_url="http://opencodex.test",
            transport=httpx.MockTransport(handler),
        )

    return create


def test_opencodex_models_and_health_preserve_upstream_contracts():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/healthz":
            return httpx.Response(200, json={"status": "ok", "service": "opencodex", "version": "test"})
        assert request.url.path == "/v1/models"
        return httpx.Response(200, json={"object": "list", "data": [{"id": "gpt-5"}, {"id": "anthropic/opus"}]})

    factory = client_factory(handler)
    assert [row["id"] for row in asyncio.run(list_opencodex_models(factory))] == ["gpt-5", "anthropic/opus"]
    assert asyncio.run(opencodex_health(factory))["service"] == "opencodex"


def test_opencodex_non_streaming_forwards_effort_and_uses_reported_tokens():
    def handler(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.content)
        assert payload["model"] == "gpt-5"
        assert payload["reasoning_effort"] == "high"
        assert payload["messages"][0]["content"] == "hello"
        return httpx.Response(200, json={
            "model": "gpt-5",
            "choices": [{"message": {"role": "assistant", "content": "world"}}],
            "usage": {
                "prompt_tokens": 11,
                "completion_tokens": 7,
                "prompt_tokens_details": {"cached_tokens": 3},
                "completion_tokens_details": {"reasoning_tokens": 2},
            },
        })

    result = asyncio.run(complete_with_opencodex(
        [{"role": "user", "content": "hello"}],
        "gpt-5",
        "high",
        client_factory=client_factory(handler),
    ))
    assert result.text == "world"
    assert result.usage.total_tokens == 18
    assert result.usage.cached_input_tokens == 3
    assert result.usage.reasoning_tokens == 2


def test_opencodex_streaming_relays_text_and_captures_terminal_usage():
    frames = [
        {"model": "gpt-5", "choices": [{"delta": {"content": "hel"}}]},
        {"choices": [{"delta": {"content": "lo"}}]},
        {"choices": [], "usage": {"prompt_tokens": 9, "completion_tokens": 2}},
    ]
    body = "".join(f"data: {json.dumps(frame)}\n\n" for frame in frames) + "data: [DONE]\n\n"

    def handler(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.content)
        assert payload["stream_options"] == {"include_usage": True}
        return httpx.Response(200, text=body, headers={"Content-Type": "text/event-stream"})

    async def scenario():
        stream = stream_with_opencodex(
            [{"role": "user", "content": "hello"}],
            "gpt-5",
            "medium",
            client_factory=client_factory(handler),
        )
        text = "".join([part async for part in stream])
        return text, stream

    text, stream = asyncio.run(scenario())
    assert text == "hello"
    assert stream.model == "gpt-5"
    assert stream.usage.total_tokens == 11


def test_cors_is_allowlisted_and_liveness_is_public():
    client = TestClient(app)
    allowed = settings.aiwrapper_cors_origin_list[0]
    accepted = client.get("/health/live", headers={"Origin": allowed})
    rejected = client.get("/health/live", headers={"Origin": "https://attacker.invalid"})

    assert accepted.status_code == 200
    assert accepted.headers["access-control-allow-origin"] == allowed
    assert rejected.status_code == 200
    assert "access-control-allow-origin" not in rejected.headers
