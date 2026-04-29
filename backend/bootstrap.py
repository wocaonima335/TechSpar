"""Startup bootstrap for multi-user data migration."""

from __future__ import annotations

import shutil
import sqlite3
from backend.config import settings
from backend.runtime_settings import ensure_runtime_settings_table, load_runtime_settings_into_memory
from backend.email_verification import ensure_email_verification_table
from backend.security import hash_password
from backend.storage import sessions as session_storage
from backend.storage.users import ensure_admin_user, ensure_users_table, get_first_admin_user, get_user_by_username
from backend.vector_memory import init_memory_table, rebuild_index_from_profile


def _connect() -> sqlite3.Connection:
    settings.db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(settings.db_path))
    conn.row_factory = sqlite3.Row
    return conn


def _ensure_base_tables():
    ensure_users_table()
    ensure_runtime_settings_table()
    ensure_email_verification_table()
    conn = session_storage._get_conn()
    conn.close()
    init_memory_table()


def _ensure_admin():
    existing = get_user_by_username(settings.admin_username)
    if existing:
        return ensure_admin_user()

    first_admin = get_first_admin_user()
    if first_admin:
        return first_admin

    if not settings.admin_password:
        raise RuntimeError("ADMIN_PASSWORD is required when bootstrapping the first admin user.")
    return ensure_admin_user(password_hash=hash_password(settings.admin_password))


def _move_file_if_needed(src: Path, dest: Path):
    if not src.exists():
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists():
        src.unlink()
        return
    shutil.move(str(src), str(dest))


def _move_dir_contents_if_needed(src_dir: Path, dest_dir: Path):
    if not src_dir.exists():
        return
    dest_dir.mkdir(parents=True, exist_ok=True)
    for path in src_dir.iterdir():
        target = dest_dir / path.name
        if target.exists():
            if path.is_file():
                path.unlink()
            continue
        shutil.move(str(path), str(target))
    if src_dir.exists():
        try:
            src_dir.rmdir()
        except OSError:
            pass


def _migrate_files(admin_user_id: str):
    global_resume_dir = settings.resume_path
    legacy_resumes = [path for path in global_resume_dir.glob("*.pdf") if path.is_file()]
    if legacy_resumes:
        _move_file_if_needed(legacy_resumes[0], settings.get_resume_file(admin_user_id))
        for extra_file in legacy_resumes[1:]:
            extra_file.unlink()

    legacy_profile_root = settings.base_dir / "data" / "user_profile"
    legacy_profile_path = legacy_profile_root / "profile.json"
    legacy_insights_dir = legacy_profile_root / "insights"
    _move_file_if_needed(legacy_profile_path, settings.get_profile_path(admin_user_id))
    _move_dir_contents_if_needed(legacy_insights_dir, settings.get_insights_dir(admin_user_id))


def _backfill_user_ids(admin_user_id: str):
    conn = _connect()
    conn.execute("UPDATE sessions SET user_id = ? WHERE user_id IS NULL OR user_id = ''", (admin_user_id,))
    conn.execute(
        "UPDATE memory_vectors SET user_id = ? WHERE user_id IS NULL OR user_id = ''",
        (admin_user_id,),
    )
    conn.commit()
    conn.close()


def _cleanup_legacy_resume_cache():
    legacy_dir = settings.base_dir / "data" / ".index_cache" / "resume"
    if legacy_dir.exists():
        shutil.rmtree(legacy_dir)


def run_bootstrap() -> dict:
    """Ensure auth tables exist and migrate legacy single-user data."""
    _ensure_base_tables()
    load_runtime_settings_into_memory()
    admin_user = _ensure_admin()
    _migrate_files(admin_user.id)
    _backfill_user_ids(admin_user.id)
    _cleanup_legacy_resume_cache()
    rebuild_index_from_profile(admin_user.id)
    return {"admin_user_id": admin_user.id, "admin_username": admin_user.username}
