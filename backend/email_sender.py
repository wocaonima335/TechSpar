"""SMTP email sending helpers for registration verification."""

from __future__ import annotations

import smtplib
import ssl
from email.message import EmailMessage

from backend.config import settings


def _as_bool(value) -> bool:
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _as_int(value, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def send_email(to_email: str, subject: str, body: str):
    server = str(getattr(settings, "smtp_server", "") or "").strip()
    account = str(getattr(settings, "smtp_account", "") or "").strip()
    token = str(getattr(settings, "smtp_token", "") or "")
    if not server or not account or not token:
        raise RuntimeError("SMTP 服务器未配置")

    port = _as_int(getattr(settings, "smtp_port", 465), 465)
    from_email = str(getattr(settings, "smtp_from", "") or account).strip()
    ssl_enabled = _as_bool(getattr(settings, "smtp_ssl_enabled", False)) or port == 465
    force_auth_login = _as_bool(getattr(settings, "smtp_force_auth_login", False))

    message = EmailMessage()
    message["From"] = from_email
    message["To"] = to_email
    message["Subject"] = subject
    message.set_content(body)

    if ssl_enabled:
        with smtplib.SMTP_SSL(server, port, context=ssl.create_default_context(), timeout=15) as smtp:
            smtp.login(account, token)
            smtp.send_message(message)
        return

    with smtplib.SMTP(server, port, timeout=15) as smtp:
        smtp.ehlo()
        try:
            smtp.starttls(context=ssl.create_default_context())
            smtp.ehlo()
        except smtplib.SMTPException:
            if force_auth_login:
                raise
        smtp.login(account, token)
        smtp.send_message(message)


def send_registration_email(to_email: str, code: str):
    body = (
        "欢迎注册 TechSpar。\n\n"
        f"你的邮箱验证码是：{code}\n\n"
        "验证码 10 分钟内有效。如非本人操作，请忽略此邮件。"
    )
    send_email(to_email, "TechSpar 注册验证码", body)
