from pathlib import Path
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # LLM (OpenAI-compatible proxy)
    api_base: str = ""
    api_key: str = ""
    model: str = ""
    temperature: float = 0.7

    # Embedding — API mode (OpenAI-compatible, e.g. SiliconFlow) or local HuggingFace
    embedding_api_base: str = ""   # set to enable API mode, e.g. https://api.siliconflow.cn/v1
    embedding_api_key: str = ""
    embedding_model: str = "BAAI/bge-m3"

    # Auth
    jwt_secret: str = ""
    jwt_expire_minutes: int = 120
    admin_username: str = "admin"
    admin_password: str = ""

    # Paths
    base_dir: Path = Path(__file__).resolve().parent.parent
    resume_path: Path = Path(__file__).resolve().parent.parent / "data" / "resume"
    knowledge_path: Path = Path(__file__).resolve().parent.parent / "data" / "knowledge"
    high_freq_path: Path = Path(__file__).resolve().parent.parent / "data" / "high_freq"
    db_path: Path = Path(__file__).resolve().parent.parent / "data" / "interviews.db"

    # Interview settings
    max_questions_per_phase: int = 5
    max_drill_questions: int = 15

    def get_resume_dir(self, user_id: str) -> Path:
        return self.resume_path / user_id

    def get_resume_file(self, user_id: str) -> Path:
        return self.get_resume_dir(user_id) / "resume.pdf"

    def get_profile_dir(self, user_id: str) -> Path:
        return self.base_dir / "data" / "user_profile" / user_id

    def get_profile_path(self, user_id: str) -> Path:
        return self.get_profile_dir(user_id) / "profile.json"

    def get_insights_dir(self, user_id: str) -> Path:
        return self.get_profile_dir(user_id) / "insights"

    def get_resume_cache_dir(self, user_id: str) -> Path:
        return self.base_dir / "data" / ".index_cache" / "resume" / user_id

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
