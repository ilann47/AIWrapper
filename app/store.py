import hashlib
import secrets
import sqlite3
import time
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone

from app.config import settings


SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE,
 key_hash TEXT NOT NULL UNIQUE, key_prefix TEXT NOT NULL,
 enabled INTEGER NOT NULL DEFAULT 1,
 primary_limit INTEGER NOT NULL, secondary_limit INTEGER NOT NULL,
 rpm INTEGER NOT NULL DEFAULT 30, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS usage (
 id INTEGER PRIMARY KEY AUTOINCREMENT, request_id TEXT NOT NULL UNIQUE,
 user_id INTEGER NOT NULL REFERENCES users(id), model TEXT NOT NULL,
 input_tokens INTEGER NOT NULL, output_tokens INTEGER NOT NULL,
 units INTEGER NOT NULL, status TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS audit (
 id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT NOT NULL,
 event TEXT NOT NULL, detail TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_usage_user_time ON usage(user_id, created_at);
CREATE TABLE IF NOT EXISTS sessions (
 id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
 codex_thread_id TEXT, title TEXT NOT NULL, model TEXT NOT NULL,
 reasoning_effort TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
 id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL REFERENCES sessions(id),
 role TEXT NOT NULL, content TEXT NOT NULL, model TEXT, reasoning_effort TEXT,
 processing_ms INTEGER, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user_updated ON sessions(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, id);
"""


@dataclass
class User:
    id: int
    name: str
    enabled: bool
    primary_limit: int
    secondary_limit: int
    rpm: int


def hash_key(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


@contextmanager
def connection():
    settings.ensure_paths()
    db = sqlite3.connect(settings.database)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys=ON")
    try:
        yield db
        db.commit()
    finally:
        db.close()


def init_db() -> None:
    with connection() as db:
        db.executescript(SCHEMA)


def create_user(name: str, primary_limit: int, secondary_limit: int, rpm: int) -> tuple[dict, str]:
    key = "aiw_" + secrets.token_urlsafe(30)
    now = int(time.time())
    with connection() as db:
        cur = db.execute(
            "INSERT INTO users(name,key_hash,key_prefix,primary_limit,secondary_limit,rpm,created_at) VALUES(?,?,?,?,?,?,?)",
            (name, hash_key(key), key[:12], primary_limit, secondary_limit, rpm, now),
        )
        db.execute("INSERT INTO audit(actor,event,detail,created_at) VALUES(?,?,?,?)", ("admin", "user.created", name, now))
        user_id = cur.lastrowid
    return get_user_public(user_id), key


def get_user_by_key(key: str) -> User | None:
    with connection() as db:
        row = db.execute("SELECT * FROM users WHERE key_hash=?", (hash_key(key),)).fetchone()
    return _user(row) if row else None


def _user(row) -> User:
    return User(row["id"], row["name"], bool(row["enabled"]), row["primary_limit"], row["secondary_limit"], row["rpm"])


def get_user_public(user_id: int) -> dict:
    with connection() as db:
        row = db.execute("SELECT id,name,key_prefix,enabled,primary_limit,secondary_limit,rpm,created_at FROM users WHERE id=?", (user_id,)).fetchone()
    return dict(row)


def list_users() -> list[dict]:
    with connection() as db:
        rows = db.execute("SELECT id,name,key_prefix,enabled,primary_limit,secondary_limit,rpm,created_at FROM users ORDER BY id").fetchall()
    return [dict(r) for r in rows]


def update_user_limits(user_id: int, primary_limit: int, secondary_limit: int, rpm: int) -> dict | None:
    now = int(time.time())
    with connection() as db:
        cur = db.execute("UPDATE users SET primary_limit=?,secondary_limit=?,rpm=? WHERE id=?", (primary_limit, secondary_limit, rpm, user_id))
        if cur.rowcount == 0:
            return None
        db.execute("INSERT INTO audit(actor,event,detail,created_at) VALUES(?,?,?,?)", ("admin", "user.limits_updated", f"user_id={user_id}", now))
    return get_user_public(user_id)


def usage_summary(user: User) -> dict:
    now = int(time.time())
    primary_start, secondary_start = now - 5 * 3600, now - 7 * 86400
    with connection() as db:
        p = db.execute("SELECT COALESCE(SUM(units),0) v FROM usage WHERE user_id=? AND created_at>=?", (user.id, primary_start)).fetchone()["v"]
        s = db.execute("SELECT COALESCE(SUM(units),0) v FROM usage WHERE user_id=? AND created_at>=?", (user.id, secondary_start)).fetchone()["v"]
        requests_minute = db.execute("SELECT COUNT(*) v FROM usage WHERE user_id=? AND created_at>=?", (user.id, now - 60)).fetchone()["v"]
    return {
        "user": user.name,
        "primary": _window(p, user.primary_limit, primary_start + 5 * 3600),
        "secondary": _window(s, user.secondary_limit, secondary_start + 7 * 86400),
        "requests_last_minute": requests_minute,
        "rpm": user.rpm,
        "blocked": p >= user.primary_limit or s >= user.secondary_limit,
    }


def _window(used: int, limit: int, resets_at: int) -> dict:
    return {"used_units": used, "limit_units": limit, "used_percent": round(100 * used / limit, 2) if limit else 100, "resets_at": datetime.fromtimestamp(resets_at, timezone.utc).isoformat()}


def record_usage(request_id: str, user_id: int, model: str, input_tokens: int, output_tokens: int, status: str) -> int:
    units = input_tokens + output_tokens * 4
    with connection() as db:
        db.execute("INSERT INTO usage(request_id,user_id,model,input_tokens,output_tokens,units,status,created_at) VALUES(?,?,?,?,?,?,?,?)", (request_id, user_id, model, input_tokens, output_tokens, units, status, int(time.time())))
    return units


def create_session(session_id: str, user_id: int, title: str, model: str, effort: str | None) -> dict:
    now = int(time.time())
    with connection() as db:
        db.execute("INSERT INTO sessions(id,user_id,title,model,reasoning_effort,created_at,updated_at) VALUES(?,?,?,?,?,?,?)", (session_id, user_id, title[:120], model, effort, now, now))
    return get_session(session_id, user_id)


def list_sessions(user_id: int) -> list[dict]:
    with connection() as db:
        rows = db.execute("SELECT id,title,model,reasoning_effort,created_at,updated_at FROM sessions WHERE user_id=? ORDER BY updated_at DESC", (user_id,)).fetchall()
    return [dict(r) for r in rows]


def get_session(session_id: str, user_id: int) -> dict | None:
    with connection() as db:
        row = db.execute("SELECT * FROM sessions WHERE id=? AND user_id=?", (session_id, user_id)).fetchone()
        if not row:
            return None
        messages = db.execute("SELECT id,role,content,model,reasoning_effort,processing_ms,created_at FROM messages WHERE session_id=? ORDER BY id", (session_id,)).fetchall()
    result = dict(row)
    result["messages"] = [dict(m) for m in messages]
    return result


def add_message(session_id: str, role: str, content: str, model: str | None = None, effort: str | None = None, processing_ms: int | None = None) -> None:
    now = int(time.time())
    with connection() as db:
        db.execute("INSERT INTO messages(session_id,role,content,model,reasoning_effort,processing_ms,created_at) VALUES(?,?,?,?,?,?,?)", (session_id, role, content, model, effort, processing_ms, now))
        db.execute("UPDATE sessions SET model=COALESCE(?,model),reasoning_effort=?,updated_at=? WHERE id=?", (model, effort, now, session_id))


def set_codex_thread(session_id: str, thread_id: str) -> None:
    with connection() as db:
        db.execute("UPDATE sessions SET codex_thread_id=? WHERE id=?", (thread_id, session_id))
