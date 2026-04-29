"""Email verification code storage for self-service registration."""

from __future__ import annotations

import random
import sqlite3
from datetime import datetime, timedelta

from backend.config import settings

DB_PATH = settings.db_path
CODE_TTL_MINUTES = 10


def _get_conn() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def ensure_email_verification_table():
    conn = _get_conn()
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS email_verification_codes (
            email TEXT PRIMARY KEY,
            code TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            consumed_at TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    conn.commit()
    conn.close()


def normalize_email(email: str) -> str:
    return email.strip().lower()


def create_email_verification_code(email: str, code: str | None = None) -> str:
    ensure_email_verification_table()
    normalized = normalize_email(email)
    verification_code = code or f"{random.SystemRandom().randint(0, 999999):06d}"
    expires_at = (datetime.now() + timedelta(minutes=CODE_TTL_MINUTES)).isoformat()
    conn = _get_conn()
    conn.execute(
        """
        INSERT INTO email_verification_codes (email, code, expires_at, consumed_at, created_at)
        VALUES (?, ?, ?, NULL, CURRENT_TIMESTAMP)
        ON CONFLICT(email) DO UPDATE SET
            code = excluded.code,
            expires_at = excluded.expires_at,
            consumed_at = NULL,
            created_at = CURRENT_TIMESTAMP
        """,
        (normalized, verification_code, expires_at),
    )
    conn.commit()
    conn.close()
    return verification_code


def verify_email_code(email: str, code: str, *, consume: bool = False) -> bool:
    ensure_email_verification_table()
    normalized = normalize_email(email)
    conn = _get_conn()
    row = conn.execute(
        "SELECT email, code, expires_at, consumed_at FROM email_verification_codes WHERE email = ?",
        (normalized,),
    ).fetchone()
    if not row:
        conn.close()
        return False
    if row["consumed_at"]:
        conn.close()
        return False
    try:
        expires_at = datetime.fromisoformat(row["expires_at"])
    except ValueError:
        conn.close()
        return False
    if expires_at < datetime.now() or str(row["code"]) != str(code).strip():
        conn.close()
        return False
    if consume:
        conn.execute(
            "UPDATE email_verification_codes SET consumed_at = ? WHERE email = ?",
            (datetime.now().isoformat(), normalized),
        )
        conn.commit()
    conn.close()
    return True
