"""OpenCodex data-plane adapter.

The provider, OAuth, account-pool, fallback and wire-protocol implementations stay
inside the unmodified OpenCodex server.  This module only translates the existing
Codex-Wrapper execution seam to OpenCodex's OpenAI-compatible HTTP boundary.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, AsyncIterator, Callable, Optional
from urllib.parse import urlparse

import httpx

from ..codex import CodexError, codex_parallel_slot
from ..config import settings


@dataclass
class ExecutionUsage:
    input_tokens: int = 0
    output_tokens: int = 0
    cached_input_tokens: int = 0
    reasoning_tokens: int = 0

    @property
    def total_tokens(self) -> int:
        return self.input_tokens + self.output_tokens


@dataclass
class OpenCodexCompletion:
    text: str
    usage: ExecutionUsage
    model: str


class OpenCodexTextStream:
    def __init__(self, iterator: AsyncIterator[str]) -> None:
        self._iterator = iterator
        self.usage = ExecutionUsage()
        self.model: Optional[str] = None

    def __aiter__(self) -> AsyncIterator[str]:
        return self._iterator


ClientFactory = Callable[[], httpx.AsyncClient]


def is_opencodex_backend() -> bool:
    return settings.aiwrapper_execution_backend.strip().lower() == "opencodex"


def _base_url() -> str:
    value = settings.aiwrapper_opencodex_base_url.strip().rstrip("/")
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
        raise CodexError("AIWRAPPER_OPENCODEX_BASE_URL must be an http(s) URL without embedded credentials", status_code=500)
    return value


def _headers() -> dict[str, str]:
    token = settings.aiwrapper_opencodex_api_key
    return {
        "Accept": "application/json",
        **({"X-OpenCodex-API-Key": token} if token else {}),
    }


def _client() -> httpx.AsyncClient:
    timeout = httpx.Timeout(float(settings.timeout_seconds), connect=min(10.0, float(settings.timeout_seconds)))
    return httpx.AsyncClient(
        base_url=_base_url(),
        headers=_headers(),
        timeout=timeout,
        follow_redirects=False,
        trust_env=False,
    )


def _error_message(response: httpx.Response) -> str:
    try:
        payload = response.json()
    except (json.JSONDecodeError, ValueError):
        return response.text.strip() or f"OpenCodex returned HTTP {response.status_code}"
    if isinstance(payload, dict):
        error = payload.get("error")
        if isinstance(error, dict) and isinstance(error.get("message"), str):
            return error["message"]
        if isinstance(error, str):
            return error
        detail = payload.get("detail")
        if isinstance(detail, str):
            return detail
    return f"OpenCodex returned HTTP {response.status_code}"


def _usage(value: Any) -> ExecutionUsage:
    row = value if isinstance(value, dict) else {}
    prompt_details = row.get("prompt_tokens_details") if isinstance(row.get("prompt_tokens_details"), dict) else {}
    completion_details = row.get("completion_tokens_details") if isinstance(row.get("completion_tokens_details"), dict) else {}
    return ExecutionUsage(
        input_tokens=max(0, int(row.get("prompt_tokens", row.get("input_tokens", 0)) or 0)),
        output_tokens=max(0, int(row.get("completion_tokens", row.get("output_tokens", 0)) or 0)),
        cached_input_tokens=max(0, int(prompt_details.get("cached_tokens", 0) or 0)),
        reasoning_tokens=max(0, int(completion_details.get("reasoning_tokens", 0) or 0)),
    )


def _content_text(value: Any) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        parts: list[str] = []
        for part in value:
            if isinstance(part, dict) and isinstance(part.get("text"), str):
                parts.append(part["text"])
        return "".join(parts)
    return ""


def _chat_payload(
    messages: list[dict[str, Any]],
    model: str,
    effort: Optional[str],
    *,
    stream: bool,
    temperature: Optional[float] = None,
    max_tokens: Optional[int] = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {"model": model, "messages": messages, "stream": stream}
    if effort:
        payload["reasoning_effort"] = effort
    if temperature is not None:
        payload["temperature"] = temperature
    if max_tokens is not None:
        payload["max_tokens"] = max_tokens
    if stream:
        payload["stream_options"] = {"include_usage": True}
    return payload


async def list_opencodex_models(client_factory: ClientFactory = _client) -> list[dict[str, Any]]:
    try:
        async with client_factory() as client:
            response = await client.get("/v1/models")
    except httpx.HTTPError as error:
        raise CodexError(f"OpenCodex model discovery failed: {error}", status_code=503) from error
    if response.status_code >= 400:
        raise CodexError(_error_message(response), status_code=response.status_code)
    payload = response.json()
    rows = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(rows, list):
        raise CodexError("OpenCodex model discovery returned an invalid payload", status_code=502)
    return [row for row in rows if isinstance(row, dict) and isinstance(row.get("id"), str)]


async def opencodex_health(client_factory: ClientFactory = _client) -> dict[str, Any]:
    try:
        async with client_factory() as client:
            response = await client.get("/healthz")
    except httpx.HTTPError as error:
        raise CodexError(f"OpenCodex health check failed: {error}", status_code=503) from error
    if response.status_code >= 400:
        raise CodexError(_error_message(response), status_code=503)
    payload = response.json()
    if not isinstance(payload, dict) or payload.get("status") != "ok" or payload.get("service") != "opencodex":
        raise CodexError("OpenCodex health check returned an invalid identity", status_code=503)
    return payload


async def complete_with_opencodex(
    messages: list[dict[str, Any]],
    model: str,
    effort: Optional[str],
    *,
    temperature: Optional[float] = None,
    max_tokens: Optional[int] = None,
    client_factory: ClientFactory = _client,
) -> OpenCodexCompletion:
    payload = _chat_payload(messages, model, effort, stream=False, temperature=temperature, max_tokens=max_tokens)
    try:
        async with codex_parallel_slot():
            async with client_factory() as client:
                response = await client.post("/v1/chat/completions", json=payload)
    except httpx.HTTPError as error:
        raise CodexError(f"OpenCodex request failed: {error}", status_code=503) from error
    if response.status_code >= 400:
        raise CodexError(_error_message(response), status_code=response.status_code)
    body = response.json()
    choices = body.get("choices") if isinstance(body, dict) else None
    message = choices[0].get("message") if isinstance(choices, list) and choices and isinstance(choices[0], dict) else None
    text = _content_text(message.get("content")) if isinstance(message, dict) else ""
    if not text:
        raise CodexError("OpenCodex returned no assistant content", status_code=502)
    return OpenCodexCompletion(
        text=text,
        usage=_usage(body.get("usage")),
        model=str(body.get("model") or model),
    )


def stream_with_opencodex(
    messages: list[dict[str, Any]],
    model: str,
    effort: Optional[str],
    *,
    temperature: Optional[float] = None,
    max_tokens: Optional[int] = None,
    client_factory: ClientFactory = _client,
) -> OpenCodexTextStream:
    stream: OpenCodexTextStream

    async def iterate() -> AsyncIterator[str]:
        payload = _chat_payload(messages, model, effort, stream=True, temperature=temperature, max_tokens=max_tokens)
        client = client_factory()
        response: Optional[httpx.Response] = None
        try:
            async with codex_parallel_slot():
                request = client.build_request("POST", "/v1/chat/completions", json=payload)
                response = await client.send(request, stream=True)
                if response.status_code >= 400:
                    await response.aread()
                    raise CodexError(_error_message(response), status_code=response.status_code)
                async for line in response.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    raw = line[5:].strip()
                    if not raw or raw == "[DONE]":
                        continue
                    try:
                        event = json.loads(raw)
                    except json.JSONDecodeError as error:
                        raise CodexError("OpenCodex returned malformed SSE JSON", status_code=502) from error
                    if not isinstance(event, dict):
                        continue
                    if event.get("error"):
                        error = event["error"]
                        message = error.get("message") if isinstance(error, dict) else str(error)
                        raise CodexError(message or "OpenCodex stream failed", status_code=502)
                    if event.get("usage"):
                        stream.usage = _usage(event["usage"])
                    if isinstance(event.get("model"), str):
                        stream.model = event["model"]
                    choices = event.get("choices")
                    choice = choices[0] if isinstance(choices, list) and choices and isinstance(choices[0], dict) else None
                    delta = choice.get("delta") if isinstance(choice, dict) else None
                    text = _content_text(delta.get("content")) if isinstance(delta, dict) else ""
                    if text:
                        yield text
        except httpx.HTTPError as error:
            raise CodexError(f"OpenCodex stream failed: {error}", status_code=503) from error
        finally:
            if response is not None:
                await response.aclose()
            await client.aclose()

    stream = OpenCodexTextStream(iterate())
    return stream
