import asyncio
import os
from pathlib import Path

from ..config import settings


async def ensure_profile(name: str) -> str:
    env = os.environ.copy()
    env["CODEX_PROFILE_NO_UPDATE_CHECK"] = "1"
    script = str(Path(settings.aiwrapper_profile_script).resolve())
    process = await asyncio.create_subprocess_exec(
        settings.aiwrapper_profile_bash,
        script,
        "init",
        name,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=env,
    )
    _, stderr = await process.communicate()
    if process.returncode != 0 and b"already exists" not in stderr.lower():
        raise RuntimeError(stderr.decode("utf-8", errors="replace").strip() or "codex-profile init failed")
    path_process = await asyncio.create_subprocess_exec(
        settings.aiwrapper_profile_bash,
        script,
        "path",
        name,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=env,
    )
    stdout, path_stderr = await path_process.communicate()
    if path_process.returncode != 0:
        raise RuntimeError(path_stderr.decode("utf-8", errors="replace").strip() or "codex-profile path failed")
    posix_path = stdout.decode("utf-8").strip()
    if len(posix_path) > 3 and posix_path[0] == "/" and posix_path[2] == "/":
        return f"{posix_path[1].upper()}:{posix_path[2:]}"
    return posix_path
