"""LlamaIndex helpers for resume and topic knowledge retrieval."""

from __future__ import annotations

import json
from pathlib import Path

from llama_index.core import (
    Settings as LlamaSettings,
    SimpleDirectoryReader,
    StorageContext,
    VectorStoreIndex,
    load_index_from_storage,
)

from backend.config import settings
from backend.llm_provider import get_embedding, get_llama_llm

PERSIST_DIR = settings.base_dir / "data" / ".index_cache"
_index_cache: dict[str, "VectorStoreIndex"] = {}
TOPICS_JSON = settings.base_dir / "data" / "topics.json"


def load_topics() -> dict:
    """Load topics from data/topics.json."""
    if TOPICS_JSON.exists():
        return json.loads(TOPICS_JSON.read_text(encoding="utf-8"))
    return {}


def save_topics(topics: dict):
    """Persist topics back to data/topics.json."""
    TOPICS_JSON.parent.mkdir(parents=True, exist_ok=True)
    TOPICS_JSON.write_text(
        json.dumps(topics, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def get_topic_map() -> dict[str, str]:
    return {key: value["dir"] for key, value in load_topics().items()}


class _TopicMapProxy(dict):
    """Lazy proxy that reads topics.json on every access."""

    def __getitem__(self, key):
        return get_topic_map()[key]

    def __contains__(self, key):
        return key in get_topic_map()

    def __iter__(self):
        return iter(get_topic_map())

    def keys(self):
        return get_topic_map().keys()

    def values(self):
        return get_topic_map().values()

    def items(self):
        return get_topic_map().items()

    def __len__(self):
        return len(get_topic_map())

    def get(self, key, default=None):
        return get_topic_map().get(key, default)


TOPIC_MAP = _TopicMapProxy()


def _init_llama_settings():
    LlamaSettings.llm = get_llama_llm()
    LlamaSettings.embed_model = get_embedding()


def _get_resume_dir(user_id: str) -> Path:
    helper = getattr(settings, "get_resume_dir", None)
    if callable(helper):
        return helper(user_id)
    return settings.resume_path / user_id


def _get_resume_cache_dir(user_id: str) -> Path:
    helper = getattr(settings, "get_resume_cache_dir", None)
    if callable(helper):
        return helper(user_id)
    return PERSIST_DIR / "resume" / user_id


def _resume_cache_key(user_id: str) -> str:
    return f"resume:{user_id}"


def build_resume_index(user_id: str, force_rebuild: bool = False) -> VectorStoreIndex:
    """Build or load a user's resume index."""
    cache_key = _resume_cache_key(user_id)
    if cache_key in _index_cache and not force_rebuild:
        return _index_cache[cache_key]

    _init_llama_settings()
    resume_dir = _get_resume_dir(user_id)
    cache_dir = _get_resume_cache_dir(user_id)

    if cache_dir.exists() and not force_rebuild:
        storage_context = StorageContext.from_defaults(persist_dir=str(cache_dir))
        index = load_index_from_storage(storage_context)
    else:
        docs = SimpleDirectoryReader(
            input_dir=str(resume_dir),
            recursive=True,
        ).load_data()
        index = VectorStoreIndex.from_documents(docs)
        cache_dir.mkdir(parents=True, exist_ok=True)
        index.storage_context.persist(persist_dir=str(cache_dir))

    _index_cache[cache_key] = index
    return index


def build_topic_index(topic: str, force_rebuild: bool = False) -> VectorStoreIndex:
    """Build or load the shared topic knowledge index."""
    if topic in _index_cache and not force_rebuild:
        return _index_cache[topic]

    _init_llama_settings()

    if topic not in TOPIC_MAP:
        raise ValueError(f"Unknown topic: {topic}. Available: {list(TOPIC_MAP.keys())}")

    dir_name = TOPIC_MAP[topic]
    topic_dir = settings.knowledge_path / dir_name
    cache_dir = PERSIST_DIR / topic

    if cache_dir.exists() and not force_rebuild:
        storage_context = StorageContext.from_defaults(persist_dir=str(cache_dir))
        index = load_index_from_storage(storage_context)
    else:
        if not topic_dir.exists():
            raise FileNotFoundError(f"Knowledge directory not found: {topic_dir}")

        docs = SimpleDirectoryReader(
            input_dir=str(topic_dir),
            recursive=True,
            required_exts=[".md", ".txt", ".py"],
        ).load_data()

        if not docs:
            raise ValueError(f"No documents found in {topic_dir}")

        index = VectorStoreIndex.from_documents(docs)
        cache_dir.mkdir(parents=True, exist_ok=True)
        index.storage_context.persist(persist_dir=str(cache_dir))

    _index_cache[topic] = index
    return index


def query_resume(user_id: str, question: str, top_k: int = 3) -> str:
    index = build_resume_index(user_id)
    engine = index.as_query_engine(similarity_top_k=top_k)
    response = engine.query(question)
    return str(response)


def query_topic(topic: str, question: str, top_k: int = 5) -> str:
    index = build_topic_index(topic)
    engine = index.as_query_engine(similarity_top_k=top_k)
    response = engine.query(question)
    return str(response)


def retrieve_topic_context(topic: str, question: str, top_k: int = 5) -> list[str]:
    index = build_topic_index(topic)
    retriever = index.as_retriever(similarity_top_k=top_k)
    nodes = retriever.retrieve(question)
    return [node.get_content() for node in nodes]
