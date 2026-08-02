"""Administrative boundary for the 9router SQLite safety-backup runtime."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from ..config import settings
from .nine_router import nine_router


def backup_root() -> Path:
    root = (Path(settings.aiwrapper_state_dir).resolve() / "backups")
    root.mkdir(parents=True, exist_ok=True)
    return root


async def create_backup() -> dict[str, Any]:
    root = backup_root()
    result = await nine_router("backup", {
        "databasePath": str(Path(settings.aiwrapper_database_path).resolve()),
        "label": "manual",
    }, {"AIWRAPPER_BACKUPS_DIR": str(root)})
    backup_path = Path(result["backupPath"]).resolve()
    if root not in backup_path.parents or not backup_path.is_file():
        raise RuntimeError("9router backup returned an invalid path")
    return _metadata(backup_path.parent)


def list_backups() -> list[dict[str, Any]]:
    root = backup_root()
    entries = [_metadata(directory) for directory in root.iterdir() if directory.is_dir() and (directory / "aiwrapper.sqlite").is_file()]
    return sorted(entries, key=lambda item: item["createdAt"], reverse=True)


def resolve_backup(backup_id: str) -> Optional[Path]:
    root = backup_root()
    candidate = (root / backup_id / "aiwrapper.sqlite").resolve()
    if root not in candidate.parents or not candidate.is_file():
        return None
    return candidate


def _metadata(directory: Path) -> dict[str, Any]:
    target = directory / "aiwrapper.sqlite"
    stat = target.stat()
    return {
        "id": directory.name,
        "filename": f"aiwrapper-{directory.name}.sqlite",
        "sizeBytes": stat.st_size,
        "createdAt": datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat(),
    }
