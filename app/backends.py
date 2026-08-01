import asyncio
import json
import os
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

import httpx

from app.config import settings


@dataclass
class BackendResult:
    content: str
    input_tokens: int
    output_tokens: int
    raw: dict
    thread_id: str | None = None


def estimate_tokens(text: str) -> int:
    return max(1, (len(text) + 3) // 4)


def codex_command() -> list[str]:
    configured = settings.codex_path
    if os.name == "nt" and configured.lower() == "codex":
        cmd_shim = shutil.which("codex.cmd")
        node = shutil.which("node.exe") or shutil.which("node")
        if cmd_shim and node:
            cli = Path(cmd_shim).parent / "node_modules" / "@openai" / "codex" / "bin" / "codex.js"
            if cli.is_file():
                return [node, str(cli)]
    executable = shutil.which(configured)
    return [executable or configured]


async def complete(payload: dict) -> BackendResult:
    if settings.backend == "mock":
        messages = payload.get("messages", [])
        prompt = "\n".join(str(m.get("content", "")) for m in messages)
        await asyncio.sleep(0.01)
        content = f"[laboratório] Resposta simulada para: {prompt[:240]}"
        return BackendResult(content, estimate_tokens(prompt), estimate_tokens(content), {})
    if settings.backend == "openai":
        if not settings.upstream_api_key:
            raise RuntimeError("AIWRAPPER_UPSTREAM_API_KEY não configurada")
        headers = {"Authorization": f"Bearer {settings.upstream_api_key}"}
        async with httpx.AsyncClient(timeout=120) as client:
            response = await client.post(f"{settings.upstream_base_url.rstrip('/')}/chat/completions", json=payload, headers=headers)
            response.raise_for_status()
        raw = response.json()
        usage = raw.get("usage", {})
        return BackendResult(raw["choices"][0]["message"]["content"], usage.get("prompt_tokens", 0), usage.get("completion_tokens", 0), raw)
    if settings.backend == "codex":
        return await _complete_codex(payload)
    raise RuntimeError(f"Backend desconhecido: {settings.backend}")


def _codex_prompt(payload: dict) -> str:
    parts = [
        "Você está respondendo através de um gateway de laboratório. Responda ao pedido em texto. "
        "Não execute comandos, não edite arquivos e não tente acessar credenciais.",
    ]
    for message in payload.get("messages", []):
        role = str(message.get("role", "user")).upper()
        content = message.get("content", "")
        if isinstance(content, list):
            content = "\n".join(str(part.get("text", "")) for part in content if isinstance(part, dict))
        parts.append(f"{role}: {content}")
    return "\n\n".join(parts)


async def _complete_codex(payload: dict) -> BackendResult:
    workdir = str(Path(settings.codex_workdir).resolve())
    args = [*codex_command(), "exec", "--json", "--skip-git-repo-check", "--sandbox", "read-only", "--cd", workdir]
    requested_model = settings.codex_model or str(payload.get("model", ""))
    if requested_model and requested_model != "lab-model":
        args.extend(["--model", requested_model])
    reasoning_effort = str(payload.get("reasoning_effort", "")).lower()
    allowed_efforts = {"low", "medium", "high", "xhigh", "max", "ultra"}
    if reasoning_effort:
        if reasoning_effort not in allowed_efforts:
            raise RuntimeError("Reasoning effort inválido")
        args.extend(["--config", f'model_reasoning_effort="{reasoning_effort}"'])
    speed = str(payload.get("speed", "standard")).lower()
    if speed not in {"standard", "fast"}:
        raise RuntimeError("Modo de velocidade inválido")
    if speed == "fast":
        args.extend(["--config", 'service_tier="fast"', "--config", "features.fast_mode=true"])
    codex_thread_id = payload.get("codex_thread_id")
    if codex_thread_id:
        args.extend(["resume", "--all", str(codex_thread_id), "-"])
    else:
        args.append("-")
    prompt = _codex_prompt(payload)
    try:
        completed = await asyncio.to_thread(
            subprocess.run,
            args,
            input=prompt,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            env=os.environ.copy(),
            timeout=settings.codex_timeout,
            check=False,
        )
    except subprocess.TimeoutExpired:
        raise RuntimeError("Codex excedeu o timeout configurado")
    if completed.returncode != 0:
        detail = completed.stderr[-1000:]
        raise RuntimeError(f"Codex CLI retornou {completed.returncode}: {detail}")

    content = ""
    usage = {}
    thread_id = None
    events = []
    for line in completed.stdout.splitlines():
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        events.append(event)
        if event.get("type") == "thread.started":
            thread_id = event.get("thread_id")
        if event.get("type") == "item.completed":
            item = event.get("item", {})
            if item.get("type") == "agent_message":
                content = item.get("text", content)
        if event.get("type") in {"turn.completed", "thread.completed"}:
            usage = event.get("usage") or usage
    if not content:
        raise RuntimeError("Codex terminou sem uma mensagem final")
    input_tokens = int(usage.get("input_tokens", estimate_tokens(prompt)))
    output_tokens = int(usage.get("output_tokens", estimate_tokens(content)))
    return BackendResult(content, input_tokens, output_tokens, {"event_count": len(events), "usage": usage}, thread_id or codex_thread_id)


async def codex_login_status() -> dict:
    try:
        completed = await asyncio.to_thread(
            subprocess.run,
            [*codex_command(), "login", "status"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=15,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        return {"available": False, "authenticated": False, "detail": str(exc)}
    text = (completed.stdout + completed.stderr).strip()
    return {"available": completed.returncode == 0, "authenticated": "Logged in" in text, "detail": text}


def _codex_models_sync() -> list[dict]:
    process = subprocess.Popen(
        [*codex_command(), "app-server", "--stdio"],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        text=True, encoding="utf-8", errors="replace",
    )
    assert process.stdin and process.stdout

    def send(message: dict) -> None:
        process.stdin.write(json.dumps(message) + "\n")
        process.stdin.flush()

    try:
        send({"method": "initialize", "id": 1, "params": {"clientInfo": {"name": "aiwrapper", "title": "AIWrapper", "version": "0.1.0"}}})
        while True:
            response = json.loads(process.stdout.readline())
            if response.get("id") == 1:
                break
        send({"method": "initialized", "params": {}})
        send({"method": "model/list", "id": 2, "params": {}})
        while True:
            line = process.stdout.readline()
            if not line:
                raise RuntimeError("App Server encerrou antes de listar os modelos")
            response = json.loads(line)
            if response.get("id") == 2:
                data = response.get("result", {}).get("data", [])
                return [m for m in data if not m.get("hidden")]
    finally:
        process.terminate()
        try:
            process.wait(timeout=3)
        except subprocess.TimeoutExpired:
            process.kill()


async def codex_models() -> list[dict]:
    return await asyncio.wait_for(asyncio.to_thread(_codex_models_sync), timeout=20)
