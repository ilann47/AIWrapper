import hashlib
import os
import secrets
import sqlite3
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from ..config import settings


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _hash_key(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _secret() -> str:
    return f"aiw_{secrets.token_urlsafe(32)}"


class AIWrapperStore:
    def __init__(self, database_path: str) -> None:
        path = Path(database_path).resolve()
        path.parent.mkdir(parents=True, exist_ok=True)
        self.path = path
        self._lock = threading.RLock()
        self._connection = sqlite3.connect(path, check_same_thread=False)
        self._connection.row_factory = sqlite3.Row
        self._connection.execute("PRAGMA journal_mode=WAL")
        self._migrate()
        self._bootstrap_owner()

    def _migrate(self) -> None:
        with self._connection:
            self._connection.executescript("""
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, role TEXT NOT NULL,
                    status TEXT NOT NULL, api_key_hash TEXT NOT NULL UNIQUE,
                    profile_name TEXT NOT NULL, codex_home TEXT NOT NULL,
                    quota_5h INTEGER NOT NULL, quota_7d INTEGER NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS organizations (
                    id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE,
                    quota_percent REAL NOT NULL DEFAULT 100, created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS organization_members (
                    organization_id TEXT NOT NULL, user_id TEXT NOT NULL,
                    role TEXT NOT NULL DEFAULT 'member',
                    PRIMARY KEY (organization_id, user_id)
                );
                CREATE TABLE IF NOT EXISTS sessions (
                    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT NOT NULL,
                    model TEXT NOT NULL, status TEXT NOT NULL,
                    created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
                    favorite INTEGER NOT NULL DEFAULT 0
                );
                CREATE TABLE IF NOT EXISTS messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL,
                    role TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS shares (
                    id TEXT PRIMARY KEY, session_id TEXT NOT NULL, user_id TEXT NOT NULL,
                    token TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL,
                    expires_at TEXT, revoked_at TEXT
                );
            """)
            session_columns = {
                row["name"] for row in self._connection.execute("PRAGMA table_info(sessions)").fetchall()
            }
            if "favorite" not in session_columns:
                self._connection.execute("ALTER TABLE sessions ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0")

    def _bootstrap_owner(self) -> None:
        row = self._connection.execute("SELECT id FROM users WHERE role = 'owner' LIMIT 1").fetchone()
        if row:
            return
        token = settings.aiwrapper_owner_key or _secret()
        owner_id = str(uuid.uuid4())
        codex_home = os.environ.get("CODEX_HOME") or str(Path.home() / ".codex")
        with self._connection:
            self._connection.execute(
                "INSERT INTO users VALUES (?, ?, 'owner', 'active', ?, 'default', ?, 100000, 500000, ?)",
                (owner_id, settings.aiwrapper_owner_name, _hash_key(token), codex_home, _now()),
            )
        if not settings.aiwrapper_owner_key:
            key_path = Path(settings.aiwrapper_state_dir).resolve() / "bootstrap-owner.key"
            key_path.parent.mkdir(parents=True, exist_ok=True)
            key_path.write_text(token, encoding="utf-8")

    @staticmethod
    def _dict(row: sqlite3.Row | None) -> Optional[dict[str, Any]]:
        return dict(row) if row else None

    def authenticate(self, token: str) -> Optional[dict[str, Any]]:
        with self._lock:
            row = self._connection.execute(
                "SELECT * FROM users WHERE api_key_hash = ? AND status = 'active'",
                (_hash_key(token),),
            ).fetchone()
        return self._dict(row)

    def health(self) -> bool:
        with self._lock:
            row = self._connection.execute("SELECT 1 AS ok").fetchone()
        return bool(row and row["ok"] == 1)

    def overview_counts(self) -> dict[str, int]:
        with self._lock:
            users = self._connection.execute("SELECT COUNT(*) AS total FROM users WHERE status = 'active'").fetchone()["total"]
            conversations = self._connection.execute("SELECT COUNT(*) AS total FROM sessions WHERE status = 'active'").fetchone()["total"]
            messages = self._connection.execute("SELECT COUNT(*) AS total FROM messages").fetchone()["total"]
            shares = self._connection.execute("SELECT COUNT(*) AS total FROM shares WHERE revoked_at IS NULL").fetchone()["total"]
        return {"users": users, "conversations": conversations, "messages": messages, "shares": shares}

    def list_users(self) -> list[dict[str, Any]]:
        with self._lock:
            rows = self._connection.execute("SELECT * FROM users ORDER BY created_at").fetchall()
        return [dict(row) for row in rows]

    def create_user(self, name: str, role: str, profile_name: str, codex_home: str, quota_5h: int = 100000, quota_7d: int = 500000) -> dict[str, Any]:
        user_id, token, created_at = str(uuid.uuid4()), _secret(), _now()
        with self._lock, self._connection:
            self._connection.execute(
                "INSERT INTO users VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?, ?)",
                (user_id, name, role, _hash_key(token), profile_name, codex_home, quota_5h, quota_7d, created_at),
            )
        return {"id": user_id, "name": name, "role": role, "status": "active", "profile_name": profile_name, "codex_home": codex_home, "quota_5h": quota_5h, "quota_7d": quota_7d, "apiKey": {"secret": token}}

    def update_user(self, user_id: str, values: dict[str, Any]) -> Optional[dict[str, Any]]:
        allowed = {"status", "role", "quota_5h", "quota_7d"}
        updates = [(key, value) for key, value in values.items() if key in allowed]
        if updates:
            sql = ", ".join(f"{key} = ?" for key, _ in updates)
            with self._lock, self._connection:
                self._connection.execute(f"UPDATE users SET {sql} WHERE id = ?", (*[value for _, value in updates], user_id))
        with self._lock:
            return self._dict(self._connection.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone())

    def rotate_key(self, user_id: str) -> dict[str, str]:
        token = _secret()
        with self._lock, self._connection:
            user = self._connection.execute("SELECT role FROM users WHERE id = ?", (user_id,)).fetchone()
            if not user:
                raise ValueError("User not found")
            self._connection.execute("UPDATE users SET api_key_hash = ? WHERE id = ?", (_hash_key(token), user_id))
        if user["role"] == "owner" and not settings.aiwrapper_owner_key:
            key_path = Path(settings.aiwrapper_state_dir).resolve() / "bootstrap-owner.key"
            key_path.parent.mkdir(parents=True, exist_ok=True)
            key_path.write_text(token, encoding="utf-8")
        return {"secret": token}

    def session(self, user_id: str, session_id: Optional[str], model: str, prompt: str) -> dict[str, Any]:
        now = _now()
        with self._lock, self._connection:
            row = None
            if session_id:
                row = self._connection.execute("SELECT * FROM sessions WHERE id = ? AND user_id = ? AND status = 'active'", (session_id, user_id)).fetchone()
            if row is None:
                session_id = str(uuid.uuid4())
                title = " ".join(prompt.strip().split())[:72] or "New conversation"
                self._connection.execute(
                    "INSERT INTO sessions (id, user_id, title, model, status, created_at, updated_at, favorite) VALUES (?, ?, ?, ?, 'active', ?, ?, 0)",
                    (session_id, user_id, title, model, now, now),
                )
            else:
                self._connection.execute("UPDATE sessions SET model = ?, updated_at = ? WHERE id = ?", (model, now, session_id))
            self._connection.execute("INSERT INTO messages (session_id, role, content, created_at) VALUES (?, 'user', ?, ?)", (session_id, prompt, now))
            session = self._connection.execute("SELECT * FROM sessions WHERE id = ?", (session_id,)).fetchone()
        return dict(session)

    def append_assistant(self, session_id: str, content: str) -> None:
        now = _now()
        with self._lock, self._connection:
            self._connection.execute("INSERT INTO messages (session_id, role, content, created_at) VALUES (?, 'assistant', ?, ?)", (session_id, content, now))
            self._connection.execute("UPDATE sessions SET updated_at = ? WHERE id = ?", (now, session_id))

    def session_messages(self, session_id: str) -> list[dict[str, Any]]:
        with self._lock:
            rows = self._connection.execute("SELECT id, role, content, created_at FROM messages WHERE session_id = ? ORDER BY id", (session_id,)).fetchall()
        return [dict(row) for row in rows]

    def list_sessions(self, user_id: str, query: str = "", favorites_only: bool = False) -> list[dict[str, Any]]:
        clauses = ["user_id = ?", "status = 'active'"]
        parameters: list[Any] = [user_id]
        if query.strip():
            clauses.append("title LIKE ?")
            parameters.append(f"%{query.strip()}%")
        if favorites_only:
            clauses.append("favorite = 1")
        with self._lock:
            rows = self._connection.execute(
                f"SELECT * FROM sessions WHERE {' AND '.join(clauses)} ORDER BY favorite DESC, updated_at DESC",
                parameters,
            ).fetchall()
        return [self._session_json(dict(row)) for row in rows]

    def get_session(self, user_id: str, session_id: str) -> Optional[dict[str, Any]]:
        with self._lock:
            row = self._connection.execute("SELECT * FROM sessions WHERE id = ? AND user_id = ?", (session_id, user_id)).fetchone()
        if not row:
            return None
        session = self._session_json(dict(row))
        turns = []
        for message in self.session_messages(session_id):
            if message["role"] == "user":
                item = {"id": message["id"], "type": "userMessage", "createdAt": message["created_at"], "content": [{"type": "text", "text": message["content"]}]}
            else:
                item = {"id": message["id"], "type": "agentMessage", "createdAt": message["created_at"], "text": message["content"]}
            turns.append({"items": [item]})
        return {"session": session, "thread": {"id": session_id, "turns": turns}}

    @staticmethod
    def _session_json(row: dict[str, Any]) -> dict[str, Any]:
        return {"id": row["id"], "title": row["title"], "model": row["model"], "threadId": row["id"], "status": row["status"], "favorite": bool(row.get("favorite", 0)), "createdAt": row["created_at"], "updatedAt": row["updated_at"]}

    def archive_session(self, user_id: str, session_id: str) -> None:
        with self._lock, self._connection:
            self._connection.execute("UPDATE sessions SET status = 'archived', updated_at = ? WHERE id = ? AND user_id = ?", (_now(), session_id, user_id))

    def update_session(self, user_id: str, session_id: str, values: dict[str, Any]) -> Optional[dict[str, Any]]:
        updates: list[tuple[str, Any]] = []
        if "title" in values:
            title = " ".join(str(values["title"]).strip().split())[:120]
            if title:
                updates.append(("title", title))
        if "favorite" in values:
            updates.append(("favorite", 1 if bool(values["favorite"]) else 0))
        if updates:
            updates.append(("updated_at", _now()))
            sql = ", ".join(f"{key} = ?" for key, _ in updates)
            with self._lock, self._connection:
                self._connection.execute(
                    f"UPDATE sessions SET {sql} WHERE id = ? AND user_id = ? AND status = 'active'",
                    (*[value for _, value in updates], session_id, user_id),
                )
        with self._lock:
            row = self._connection.execute(
                "SELECT * FROM sessions WHERE id = ? AND user_id = ? AND status = 'active'",
                (session_id, user_id),
            ).fetchone()
        return self._session_json(dict(row)) if row else None

    def list_organizations(self) -> list[dict[str, Any]]:
        with self._lock:
            rows = self._connection.execute("SELECT o.*, COUNT(m.user_id) member_count FROM organizations o LEFT JOIN organization_members m ON m.organization_id = o.id GROUP BY o.id ORDER BY o.created_at").fetchall()
        return [{"id": row["id"], "name": row["name"], "memberCount": row["member_count"], "quotaPercent": row["quota_percent"]} for row in rows]

    def create_organization(self, name: str) -> dict[str, Any]:
        organization_id = str(uuid.uuid4())
        with self._lock, self._connection:
            self._connection.execute("INSERT INTO organizations VALUES (?, ?, 100, ?)", (organization_id, name, _now()))
        return {"id": organization_id, "name": name, "memberCount": 0, "quotaPercent": 100}

    def list_shares(self, user_id: str) -> list[dict[str, Any]]:
        with self._lock:
            rows = self._connection.execute("SELECT * FROM shares WHERE user_id = ? AND revoked_at IS NULL ORDER BY created_at DESC", (user_id,)).fetchall()
        return [self._share_json(dict(row)) for row in rows]

    def create_share(self, user_id: str, session_id: str) -> dict[str, Any]:
        with self._lock:
            owned = self._connection.execute("SELECT id FROM sessions WHERE id = ? AND user_id = ?", (session_id, user_id)).fetchone()
        if not owned:
            raise ValueError("Session not found")
        row = {"id": str(uuid.uuid4()), "session_id": session_id, "user_id": user_id, "token": secrets.token_urlsafe(24), "created_at": _now(), "expires_at": None, "revoked_at": None}
        with self._lock, self._connection:
            self._connection.execute("INSERT INTO shares VALUES (?, ?, ?, ?, ?, ?, ?)", tuple(row.values()))
        return self._share_json(row)

    @staticmethod
    def _share_json(row: dict[str, Any]) -> dict[str, Any]:
        return {"id": row["id"], "sessionId": row["session_id"], "url": f"{settings.aiwrapper_public_base_url}/share/{row['token']}", "createdAt": row["created_at"], "expiresAt": row["expires_at"]}


store = AIWrapperStore(settings.aiwrapper_database_path)
