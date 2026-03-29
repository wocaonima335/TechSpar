"""User storage helpers for multi-user auth and admin management."""

from __future__ import annotations

import sqlite3
import uuid
from datetime import datetime

from backend.config import settings
from backend.models import AuthUser, UserRole, UserStatus

DB_PATH = settings.db_path


def _get_conn() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def ensure_users_table():
    conn = _get_conn()
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT NOT NULL,
            display_name TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL,
            status TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            last_login_at TEXT
        )
        """
    )
    conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_users_status ON users(status)")
    conn.commit()
    conn.close()


def _to_auth_user(row: sqlite3.Row | dict | None) -> AuthUser | None:
    if not row:
        return None
    data = dict(row)
    return AuthUser(
        id=data["id"],
        username=data["username"],
        display_name=data["display_name"],
        role=UserRole(data["role"]),
        status=UserStatus(data["status"]),
    )


def get_user_by_username(username: str) -> dict | None:
    conn = _get_conn()
    row = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    conn.close()
    return dict(row) if row else None


def get_user_by_id(user_id: str) -> dict | None:
    conn = _get_conn()
    row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def list_users() -> list[AuthUser]:
    conn = _get_conn()
    rows = conn.execute("SELECT * FROM users ORDER BY created_at ASC, username ASC").fetchall()
    conn.close()
    return [_to_auth_user(row) for row in rows]


def create_user(
    username: str,
    display_name: str,
    password_hash: str,
    role: UserRole = UserRole.MEMBER,
    status: UserStatus = UserStatus.ACTIVE,
    user_id: str | None = None,
) -> AuthUser:
    ensure_users_table()
    now = datetime.now().isoformat()
    user_id = user_id or uuid.uuid4().hex
    conn = _get_conn()
    conn.execute(
        """
        INSERT INTO users (id, username, display_name, password_hash, role, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (user_id, username, display_name, password_hash, role.value, status.value, now),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    conn.close()
    return _to_auth_user(row)


def update_user(
    user_id: str,
    *,
    display_name: str | None = None,
    role: UserRole | None = None,
    status: UserStatus | None = None,
) -> AuthUser | None:
    updates = []
    params: list[str] = []
    if display_name is not None:
        updates.append("display_name = ?")
        params.append(display_name)
    if role is not None:
        updates.append("role = ?")
        params.append(role.value)
    if status is not None:
        updates.append("status = ?")
        params.append(status.value)
    if not updates:
        row = get_user_by_id(user_id)
        return _to_auth_user(row)

    conn = _get_conn()
    conn.execute(f"UPDATE users SET {', '.join(updates)} WHERE id = ?", params + [user_id])
    conn.commit()
    row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    conn.close()
    return _to_auth_user(row)


def reset_user_password(user_id: str, password_hash: str) -> bool:
    conn = _get_conn()
    cursor = conn.execute(
        "UPDATE users SET password_hash = ? WHERE id = ?",
        (password_hash, user_id),
    )
    conn.commit()
    conn.close()
    return cursor.rowcount > 0


def update_last_login(user_id: str):
    conn = _get_conn()
    conn.execute(
        "UPDATE users SET last_login_at = ? WHERE id = ?",
        (datetime.now().isoformat(), user_id),
    )
    conn.commit()
    conn.close()


def ensure_admin_user(password_hash: str | None = None) -> AuthUser:
    ensure_users_table()
    existing = get_user_by_username(settings.admin_username)
    if existing:
        return _to_auth_user(existing)
    if not password_hash:
        raise ValueError("password_hash is required when creating the initial admin user")
    return create_user(
        username=settings.admin_username,
        display_name="Administrator",
        password_hash=password_hash,
        role=UserRole.ADMIN,
        status=UserStatus.ACTIVE,
    )
