import tempfile
import unittest
from pathlib import Path

from backend.config import settings
from backend.storage import users as user_storage
from backend.security import hash_password


class RuntimeSettingsTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "test.db"

        self.original_user_db_path = user_storage.DB_PATH
        user_storage.DB_PATH = self.db_path

        from backend import runtime_settings

        self.runtime_settings = runtime_settings
        self.original_runtime_db_path = runtime_settings.DB_PATH
        runtime_settings.DB_PATH = self.db_path

        self.original_values = {
            key: getattr(settings, key)
            for key in runtime_settings.RUNTIME_SETTINGS_FIELDS
        }

    def tearDown(self):
        user_storage.DB_PATH = self.original_user_db_path
        self.runtime_settings.DB_PATH = self.original_runtime_db_path
        for key, value in self.original_values.items():
            setattr(settings, key, value)
        self.temp_dir.cleanup()

    def test_runtime_settings_are_persisted_and_reloaded(self):
        self.runtime_settings.upsert_runtime_settings(
            {
                "api_base": "https://llm.example/v1",
                "api_key": "secret-key",
                "model": "gpt-test",
            }
        )

        for key in ("api_base", "api_key", "model"):
            setattr(settings, key, "")
        loaded = self.runtime_settings.load_runtime_settings_into_memory()

        self.assertEqual(loaded["api_base"], "https://llm.example/v1")
        self.assertEqual(loaded["api_key"], "secret-key")
        self.assertEqual(loaded["model"], "gpt-test")
        self.assertEqual(settings.model, "gpt-test")

    def test_runtime_settings_admin_view_masks_secrets_and_hides_embedding_fields(self):
        self.runtime_settings.upsert_runtime_settings(
            {
                "api_base": "https://llm.example/v1",
                "api_key": "super-secret-key",
                "embedding_api_base": "https://embed.example/v1",
                "embedding_api_key": "embed-secret",
                "embedding_model": "bge-m3",
                "model": "gpt-test",
            }
        )

        payload = self.runtime_settings.get_runtime_settings_admin_view()

        self.assertEqual(payload["api_base"], "https://llm.example/v1")
        self.assertEqual(payload["model"], "gpt-test")
        self.assertTrue(payload["api_key_configured"])
        self.assertNotEqual(payload["api_key_masked"], "super-secret-key")
        self.assertIn("*", payload["api_key_masked"])
        self.assertNotIn("embedding_api_base", payload)
        self.assertNotIn("embedding_api_key_configured", payload)
        self.assertNotIn("embedding_api_key_masked", payload)
        self.assertNotIn("embedding_model", payload)

    def test_delete_runtime_setting_restores_default_value(self):
        default_model = self.original_values["model"]
        self.runtime_settings.upsert_runtime_settings({"model": "gpt-test"})

        self.runtime_settings.delete_runtime_settings({"model"})

        self.assertEqual(settings.model, default_model)
        persisted = self.runtime_settings.get_persisted_runtime_settings()
        self.assertNotIn("model", persisted)


class UserStorageUsernameTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "users.db"
        self.original_user_db_path = user_storage.DB_PATH
        user_storage.DB_PATH = self.db_path
        user_storage.ensure_users_table()

    def tearDown(self):
        user_storage.DB_PATH = self.original_user_db_path
        self.temp_dir.cleanup()

    def test_update_user_can_change_username(self):
        user = user_storage.create_user(
            username="admin",
            display_name="Admin",
            password_hash=hash_password("password123"),
        )

        updated = user_storage.update_user(user.id, username="new-admin")

        self.assertEqual(updated.username, "new-admin")
        row = user_storage.get_user_by_username("new-admin")
        self.assertIsNotNone(row)
        self.assertEqual(row["id"], user.id)

    def test_update_user_rejects_duplicate_username(self):
        first = user_storage.create_user(
            username="admin",
            display_name="Admin",
            password_hash=hash_password("password123"),
        )
        user_storage.create_user(
            username="other",
            display_name="Other",
            password_hash=hash_password("password123"),
        )

        with self.assertRaises(ValueError):
            user_storage.update_user(first.id, username="other")


if __name__ == "__main__":
    unittest.main()
