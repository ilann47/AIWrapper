import asyncio
import json
from pathlib import Path
from typing import Any

from ..config import settings


async def nine_router(operation: str, payload: dict[str, Any]) -> dict[str, Any]:
    """Run the MIT-licensed 9router module through its minimal Node boundary."""
    bridge = Path(settings.aiwrapper_nine_router_bridge).resolve()
    process = await asyncio.create_subprocess_exec(
        settings.aiwrapper_node_path,
        str(bridge),
        operation,
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await process.communicate(json.dumps(payload).encode("utf-8"))
    if process.returncode != 0:
        raise RuntimeError(stderr.decode("utf-8", errors="replace").strip() or "9router bridge failed")
    return json.loads(stdout.decode("utf-8"))


async def compress_request(body: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any] | None]:
    if not settings.aiwrapper_rtk_enabled:
        return body, None
    try:
        result = await nine_router("compress", {"body": body, "enabled": True})
        return result.get("body", body), result.get("stats")
    except Exception:
        # 9router's RTK contract is fail-open: bridge failures must not block a request.
        return body, None
