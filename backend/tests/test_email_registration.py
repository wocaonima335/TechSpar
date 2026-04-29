import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException

from backend.config import settings
from backend.models import EmailVerificationRequest, RegisterRequest, RuntimeSettingsUpdateRequest
from backend.security import verify_password
from backend.storage import users as user_storage


class EmailRegistrationTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "registration.db"
        self.original_user_db_path = user_storage.DB_PATH
        user_storage.DB_PATH = self.db_path

        from backend import runtime_settings
        from backend import email_verification

        self.runtime_settings = runtime_settings
        self.email_verification = email_verification
        self.original_runtime_db_path = runtime_settings.DB_PATH
        self.original_email_db_path = email_verification.DB_PATH
        runtime_settings.DB_PATH = self.db_path
        email_verification.DB_PATH = self.db_path

        self.original_values = {key: getattr(settings, key) for key in runtime_settings.RUNTIME_SETTINGS_FIELDS}
        user_storage.ensure_users_table()
        runtime_settings.ensure_runtime_settings_table()
        email_verification.ensure_email_verification_table()

    def tearDown(self):
        user_storage.DB_PATH = self.original_user_db_path
        self.runtime_settings.DB_PATH = self.original_runtime_db_path
        self.email_verification.DB_PATH = self.original_email_db_path
        for key, value in self.original_values.items():
            setattr(settings, key, value)
        self.temp_dir.cleanup()

    def test_admin_settings_include_registration_and_mask_smtp_secret(self):
        self.runtime_settings.upsert_runtime_settings(
            {
                "registration_enabled": "true",
                "email_verification_enabled": "true",
                "smtp_server": "smtp.example.com",
                "smtp_port": "465",
                "smtp_account": "noreply@example.com",
                "smtp_from": "TechSpar <noreply@example.com>",
                "smtp_token": "smtp-secret-token",
                "smtp_ssl_enabled": "true",
                "smtp_force_auth_login": "false",
            }
        )

        payload = self.runtime_settings.get_runtime_settings_admin_view()

        self.assertTrue(payload["registration_enabled"])
        self.assertTrue(payload["email_verification_enabled"])
        self.assertEqual(payload["smtp_server"], "smtp.example.com")
        self.assertEqual(payload["smtp_port"], 465)
        self.assertEqual(payload["smtp_account"], "noreply@example.com")
        self.assertEqual(payload["smtp_from"], "TechSpar <noreply@example.com>")
        self.assertTrue(payload["smtp_token_configured"])
        self.assertNotEqual(payload["smtp_token_masked"], "smtp-secret-token")
        self.assertIn("*", payload["smtp_token_masked"])
        self.assertTrue(payload["smtp_ssl_enabled"])
        self.assertFalse(payload["smtp_force_auth_login"])

    def test_request_email_verification_stores_code_and_sends_email(self):
        self.runtime_settings.upsert_runtime_settings(
            {
                "registration_enabled": "true",
                "email_verification_enabled": "true",
                "smtp_server": "smtp.example.com",
                "smtp_port": "465",
                "smtp_account": "noreply@example.com",
                "smtp_from": "noreply@example.com",
                "smtp_token": "smtp-secret-token",
                "smtp_ssl_enabled": "true",
            }
        )
        from backend.main import request_email_verification

        with patch("backend.main.send_registration_email") as send_email:
            result = request_email_verification(EmailVerificationRequest(email="new@example.com"))

        self.assertTrue(result["ok"])
        send_email.assert_called_once()
        args, _kwargs = send_email.call_args
        self.assertEqual(args[0], "new@example.com")
        self.assertEqual(len(args[1]), 6)
        self.assertTrue(args[1].isdigit())
        self.assertTrue(self.email_verification.verify_email_code("new@example.com", args[1]))

    def test_register_requires_valid_email_code_when_verification_enabled(self):
        self.runtime_settings.upsert_runtime_settings(
            {
                "registration_enabled": "true",
                "email_verification_enabled": "true",
            }
        )
        from backend.main import register

        body = RegisterRequest(
            username="newuser",
            display_name="New User",
            email="new@example.com",
            password="password123",
            verification_code="000000",
        )

        with self.assertRaises(HTTPException) as ctx:
            register(body)

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("验证码", str(ctx.exception.detail))

    def test_register_creates_active_member_after_valid_email_code(self):
        self.runtime_settings.upsert_runtime_settings(
            {
                "registration_enabled": "true",
                "email_verification_enabled": "true",
            }
        )
        code = self.email_verification.create_email_verification_code("new@example.com", code="123456")
        self.assertEqual(code, "123456")
        from backend.main import register

        result = register(
            RegisterRequest(
                username="newuser",
                display_name="New User",
                email="new@example.com",
                password="password123",
                verification_code="123456",
            )
        )

        self.assertEqual(result["user"]["username"], "newuser")
        self.assertEqual(result["user"]["role"], "member")
        row = user_storage.get_user_by_username("newuser")
        self.assertIsNotNone(row)
        self.assertEqual(row["email"], "new@example.com")
        self.assertTrue(verify_password("password123", row["password_hash"]))

    def test_register_requires_invitation_code_when_enabled(self):
        self.runtime_settings.upsert_runtime_settings(
            {
                "registration_enabled": "true",
                "email_verification_enabled": "false",
                "invitation_code_enabled": "true",
                "invitation_code": "JOIN-TECHSPAR",
            }
        )
        from backend.main import register

        body = RegisterRequest(
            username="inviteuser",
            display_name="Invite User",
            email="invite@example.com",
            password="password123",
        )

        with self.assertRaises(HTTPException) as ctx:
            register(body)

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("邀请码", str(ctx.exception.detail))

    def test_register_accepts_valid_invitation_code(self):
        self.runtime_settings.upsert_runtime_settings(
            {
                "registration_enabled": "true",
                "email_verification_enabled": "false",
                "invitation_code_enabled": "true",
                "invitation_code": "JOIN-TECHSPAR",
            }
        )
        from backend.main import register

        result = register(
            RegisterRequest(
                username="inviteuser",
                display_name="Invite User",
                email="invite@example.com",
                password="password123",
                invitation_code=" JOIN-TECHSPAR ",
            )
        )

        self.assertEqual(result["user"]["username"], "inviteuser")
        row = user_storage.get_user_by_username("inviteuser")
        self.assertIsNotNone(row)
        self.assertEqual(row["email"], "invite@example.com")

    def test_admin_settings_include_invitation_code_metadata_without_secret(self):
        self.runtime_settings.upsert_runtime_settings(
            {
                "invitation_code_enabled": "true",
                "invitation_code": "JOIN-TECHSPAR",
            }
        )

        payload = self.runtime_settings.get_runtime_settings_admin_view()

        self.assertTrue(payload["invitation_code_enabled"])
        self.assertTrue(payload["invitation_code_configured"])
        self.assertIn("*", payload["invitation_code_masked"])
        self.assertNotIn("invitation_code", payload)
        self.assertNotEqual(payload["invitation_code_masked"], "JOIN-TECHSPAR")

    def test_admin_update_settings_accepts_registration_smtp_and_invitation_fields(self):
        from backend.main import admin_update_settings
        from backend.models import AuthUser, UserRole, UserStatus

        admin_user = AuthUser(id="admin-1", username="admin", display_name="Admin", role=UserRole.ADMIN, status=UserStatus.ACTIVE)
        body = RuntimeSettingsUpdateRequest(
            registration_enabled=True,
            email_verification_enabled=True,
            invitation_code_enabled=True,
            invitation_code="JOIN-TECHSPAR",
            smtp_server="smtp.example.com",
            smtp_port=587,
            smtp_account="noreply@example.com",
            smtp_from="noreply@example.com",
            smtp_token="smtp-secret-token",
            smtp_ssl_enabled=False,
            smtp_force_auth_login=True,
        )

        with patch("backend.main.test_runtime_llm_connection", return_value={"ok": True, "message": "ok"}):
            result = admin_update_settings(body, admin_user=admin_user)

        self.assertTrue(result["registration_enabled"])
        self.assertTrue(result["email_verification_enabled"])
        self.assertTrue(result["invitation_code_enabled"])
        self.assertTrue(result["invitation_code_configured"])
        self.assertEqual(result["smtp_server"], "smtp.example.com")
        self.assertEqual(result["smtp_port"], 587)
        self.assertTrue(result["smtp_token_configured"])


if __name__ == "__main__":
    unittest.main()
