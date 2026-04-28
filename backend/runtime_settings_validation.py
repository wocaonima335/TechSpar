"""Validation helpers for runtime-switchable LLM settings."""

from __future__ import annotations

from langchain_openai import ChatOpenAI

RUNTIME_LLM_SETTING_KEYS = {"api_base", "api_key", "model"}


def build_runtime_llm_test_payload(overrides: dict[str, str | None], current: dict[str, str | None]) -> dict[str, str]:
    payload = {
        key: str((overrides.get(key) if overrides.get(key) is not None else current.get(key)) or "").strip()
        for key in RUNTIME_LLM_SETTING_KEYS
    }

    missing = [label for label, key in (("Base URL", "api_base"), ("API Key", "api_key"), ("Model", "model")) if not payload[key]]
    if missing:
        raise ValueError(f"Missing runtime model settings: {', '.join(missing)}")
    return payload


def test_runtime_llm_connection(*, api_base: str, api_key: str, model: str) -> dict[str, str | bool]:
    candidate = build_runtime_llm_test_payload(
        {"api_base": api_base, "api_key": api_key, "model": model},
        {},
    )
    llm = ChatOpenAI(
        model=candidate["model"],
        api_key=candidate["api_key"],
        base_url=candidate["api_base"],
        temperature=0,
        timeout=20,
        max_retries=0,
    )
    response = llm.invoke("Reply with OK only.")
    content = response.content if isinstance(response.content, str) else str(response.content)
    return {
        "ok": True,
        "message": "模型连接测试成功",
        "api_base": candidate["api_base"],
        "model": candidate["model"],
        "response_preview": content[:200].strip(),
    }
