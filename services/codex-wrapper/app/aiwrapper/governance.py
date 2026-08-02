import asyncio
import json
import os
from pathlib import Path
from typing import Any

from ..config import settings


async def governance(operation: str, payload: dict[str, Any]) -> dict[str, Any]:
    bridge = Path(settings.aiwrapper_governance_bridge).resolve()
    env = os.environ.copy()
    env["CODEX_MULTI_AUTH_DIR"] = str(Path(settings.aiwrapper_multi_auth_dir).resolve())
    process = await asyncio.create_subprocess_exec(
        settings.aiwrapper_node_path,
        str(bridge),
        operation,
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=env,
    )
    stdout, stderr = await process.communicate(json.dumps(payload).encode("utf-8"))
    if process.returncode != 0:
        raise RuntimeError(stderr.decode("utf-8", errors="replace").strip() or "governance bridge failed")
    return json.loads(stdout.decode("utf-8"))


async def evaluate_user_quota(user: dict[str, Any]) -> tuple[bool, dict[str, Any]]:
    now_ms = int(__import__("time").time() * 1000)
    checks = {}
    for label, duration_ms, limit in (
        ("5h", 5 * 60 * 60 * 1000, user["quota_5h"]),
        ("7d", 7 * 24 * 60 * 60 * 1000, user["quota_7d"]),
    ):
        checks[label] = await governance("evaluate", {
            "userId": user["id"],
            "since": now_ms - duration_ms,
            "label": label,
            "window": "hour" if label == "5h" else "week",
            "maxTokens": limit,
        })
    return all(check["allowed"] for check in checks.values()), checks


async def record_usage(**payload: Any) -> dict[str, Any]:
    return await governance("append", payload)
