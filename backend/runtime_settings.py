"""Runtime-configurable system settings stored in SQLite."""

from __future__ import annotations

import sqlite3
from typing import Any

from backend.config import settings

DB_PATH = settings.db_path
RUNTIME_SETTINGS_FIELDS = (
    "api_base",
    "api_key",
    "model",
    "embedding_api_base",
    "embedding_api_key",
    "embedding_model",
)
DEFAULT_RUNTIME_SETTINGS = {
    key: getattr(settings, key)
    for key in RUNTIME_SETTINGS_FIELDS
}
SECRET_FIELDS = {"api_key", "embedding_api_key"}
FLOAT_FIELDS = set()


def _get_conn() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def ensure_runtime_settings_table():
    conn = _get_conn()
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS system_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    conn.commit()
    conn.close()


def _coerce_value(key: str, value: str) -> Any:
    if key in FLOAT_FIELDS:
        return float(value)
    return value


def _serialize_value(key: str, value: Any) -> str:
    if key in FLOAT_FIELDS:
        return str(float(value))
    return "" if value is None else str(value)


def get_persisted_runtime_settings() -> dict[str, Any]:
    ensure_runtime_settings_table()
    conn = _get_conn()
    rows = conn.execute(
        "SELECT key, value FROM system_settings WHERE key IN ({})".format(
            ",".join("?" for _ in RUNTIME_SETTINGS_FIELDS)
        ),
        list(RUNTIME_SETTINGS_FIELDS),
    ).fetchall()
    conn.close()
    return {row["key"]: _coerce_value(row["key"], row["value"]) for row in rows}


def load_runtime_settings_into_memory() -> dict[str, Any]:
    persisted = get_persisted_runtime_settings()
    merged: dict[str, Any] = {}
    for key in RUNTIME_SETTINGS_FIELDS:
        value = persisted.get(key, DEFAULT_RUNTIME_SETTINGS[key])
        setattr(settings, key, value)
        merged[key] = value
    return merged


def upsert_runtime_settings(values: dict[str, Any]) -> dict[str, Any]:
    ensure_runtime_settings_table()
    unknown = sorted(set(values) - set(RUNTIME_SETTINGS_FIELDS))
    if unknown:
        raise ValueError(f"Unknown runtime settings: {', '.join(unknown)}")

    conn = _get_conn()
    for key, value in values.items():
        conn.execute(
            """
            INSERT INTO system_settings (key, value, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
            """,
            (key, _serialize_value(key, value)),
        )
    conn.commit()
    conn.close()
    return load_runtime_settings_into_memory()


def delete_runtime_settings(keys: set[str]) -> dict[str, Any]:
    ensure_runtime_settings_table()
    unknown = sorted(set(keys) - set(RUNTIME_SETTINGS_FIELDS))
    if unknown:
        raise ValueError(f"Unknown runtime settings: {', '.join(unknown)}")
    if not keys:
        return load_runtime_settings_into_memory()

    conn = _get_conn()
    conn.execute(
        "DELETE FROM system_settings WHERE key IN ({})".format(
            ",".join("?" for _ in keys)
        ),
        list(keys),
    )
    conn.commit()
    conn.close()
    return load_runtime_settings_into_memory()


def _mask_secret(value: str) -> str:
    if not value:
        return ""
    if len(value) <= 4:
        return "*" * len(value)
    if len(value) <= 8:
        return value[:1] + ("*" * (len(value) - 2)) + value[-1:]
    return value[:2] + ("*" * (len(value) - 4)) + value[-2:]


ADMIN_VISIBLE_FIELDS = ("api_base", "api_key", "model")


def get_runtime_settings_admin_view() -> dict[str, Any]:
    current = load_runtime_settings_into_memory()
    payload: dict[str, Any] = {}
    for key in ADMIN_VISIBLE_FIELDS:
        value = current.get(key)
        if key in SECRET_FIELDS:
            payload[f"{key}_configured"] = bool(value)
            payload[f"{key}_masked"] = _mask_secret(str(value)) if value else ""
        else:
            payload[key] = value
    return payload
