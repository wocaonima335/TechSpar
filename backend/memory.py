"""User profile memory helpers."""

from __future__ import annotations

import copy
import json
import logging
import re
from datetime import datetime
from pathlib import Path

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from backend.config import settings
from backend.llm_provider import get_langchain_llm

logger = logging.getLogger("uvicorn")

DEFAULT_PROFILE = {
    "name": "",
    "target_role": "AI 应用开发实习生",
    "updated_at": "",
    "topic_mastery": {},
    "weak_points": [],
    "strong_points": [],
    "communication": {
        "style": "",
        "habits": [],
        "suggestions": [],
    },
    "thinking_patterns": {
        "strengths": [],
        "gaps": [],
    },
    "stats": {
        "total_sessions": 0,
        "resume_sessions": 0,
        "drill_sessions": 0,
        "avg_score": 0,
        "score_history": [],
    },
}

EXTRACT_PROMPT = """你是一个面试复盘分析引擎。请根据候选人的本轮对话和评分结果，抽取结构化画像信息，只返回 JSON。

当前画像：
{current_profile}

本轮模式：{mode}
本轮领域：{topic}

对话记录：
{transcript}

评分记录：
{scores}

返回结构：
{{
  "weak_points": [{{"point": "具体薄弱点", "topic": "topic_key"}}],
  "strong_points": [{{"point": "具体亮点", "topic": "topic_key"}}],
  "topic_mastery": {{
    "{topic_key_example}": {{"notes": "一句话总结掌握情况"}}
  }},
  "communication_observations": {{
    "style_update": "一句话描述表达风格变化",
    "new_habits": ["新的表达习惯"],
    "new_suggestions": ["新的改进建议"]
  }},
  "thinking_patterns": {{
    "new_strengths": ["新的思维优势"],
    "new_gaps": ["新的思维短板"]
  }},
  "session_summary": "本轮训练总结",
  "dimension_scores": {{
    "technical_depth": 0,
    "project_articulation": 0,
    "communication": 0,
    "problem_solving": 0
  }},
  "avg_score": 0
}}

规则：
- 只提取当前对话里有证据的信息，不要臆测。
- 薄弱点和亮点必须具体，不能泛泛而谈。
- `topic_mastery` 只写 notes，不要编造 level。
- 专项训练模式下允许 `dimension_scores` 为空。
"""


def _get_profile_dir(user_id: str) -> Path:
    helper = getattr(settings, "get_profile_dir", None)
    if callable(helper):
        return helper(user_id)
    return settings.base_dir / "data" / "user_profile" / user_id


def _get_profile_path(user_id: str) -> Path:
    helper = getattr(settings, "get_profile_path", None)
    if callable(helper):
        return helper(user_id)
    return _get_profile_dir(user_id) / "profile.json"


def _get_insights_dir(user_id: str) -> Path:
    helper = getattr(settings, "get_insights_dir", None)
    if callable(helper):
        return helper(user_id)
    return _get_profile_dir(user_id) / "insights"


def _default_profile() -> dict:
    return copy.deepcopy(DEFAULT_PROFILE)


def _load_profile(user_id: str) -> dict:
    profile_path = _get_profile_path(user_id)
    if profile_path.exists():
        return json.loads(profile_path.read_text(encoding="utf-8"))
    return _default_profile()


def _save_profile(user_id: str, profile: dict):
    profile_dir = _get_profile_dir(user_id)
    profile_dir.mkdir(parents=True, exist_ok=True)
    profile["updated_at"] = datetime.now().isoformat()
    _get_profile_path(user_id).write_text(
        json.dumps(profile, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def _save_insight(user_id: str, mode: str, topic: str | None, summary: str, raw_extraction: dict):
    insights_dir = _get_insights_dir(user_id)
    insights_dir.mkdir(parents=True, exist_ok=True)
    today = datetime.now().strftime("%Y-%m-%d")
    path = insights_dir / f"{today}.md"

    time_str = datetime.now().strftime("%H:%M")
    entry = f"\n## {time_str} | {mode} | {topic or '综合'}\n\n{summary}\n"

    if raw_extraction.get("weak_points"):
        entry += "\n**薄弱点**\n"
        for weak_point in raw_extraction["weak_points"]:
            entry += f"- {weak_point['point']} ({weak_point.get('topic', '')})\n"

    if raw_extraction.get("strong_points"):
        entry += "\n**亮点**\n"
        for strong_point in raw_extraction["strong_points"]:
            entry += f"- {strong_point['point']} ({strong_point.get('topic', '')})\n"

    entry += "\n---\n"
    with open(path, "a", encoding="utf-8") as file:
        file.write(entry)


def get_profile(user_id: str) -> dict:
    return _load_profile(user_id)


def get_topic_context_for_drill(user_id: str, topic: str) -> dict:
    """Get personalized context for drill question generation."""
    profile = _load_profile(user_id)

    mastery = profile.get("topic_mastery", {}).get(topic, {})
    mastery_score = mastery.get("score", mastery.get("level", 0) * 20)
    mastery_info = (
        f"{mastery_score}/100 - {mastery.get('notes', '')}"
        if mastery_score > 0
        else "新领域，暂无历史数据"
    )

    topic_weak = [
        weak_point["point"]
        for weak_point in profile.get("weak_points", [])
        if weak_point.get("topic") == topic and not weak_point.get("improved")
    ]

    recent_questions = [
        history.get("question", "")
        for history in profile.get("stats", {}).get("score_history", [])
        if history.get("topic") == topic and history.get("question")
    ][-20:]

    past_insights = []
    try:
        from backend.vector_memory import search_memory

        results = search_memory(
            user_id=user_id,
            query=f"{topic} 面试薄弱点 常见错误",
            chunk_types=["session_summary", "insight"],
            topic=topic,
            top_k=3,
        )
        past_insights = [result["content"] for result in results if result["score"] > 0.3]
    except Exception:
        pass

    return {
        "mastery_info": mastery_info,
        "mastery_score": mastery_score,
        "weak_points": topic_weak,
        "recent_questions": recent_questions,
        "past_insights": past_insights,
    }


def update_profile_realtime(
    user_id: str,
    mode: str,
    topic: str | None,
    score_entry: dict | None = None,
    weak_point: str | None = None,
):
    """Lightweight profile update without an LLM call."""
    profile = _load_profile(user_id)
    now = datetime.now().isoformat()

    if score_entry and score_entry.get("score") is not None:
        history = profile.setdefault("stats", {}).setdefault("score_history", [])
        history.append(
            {
                "date": now[:10],
                "mode": mode,
                "topic": topic,
                "avg_score": score_entry["score"],
                "question": score_entry.get("question", "")[:80],
                "assessment": score_entry.get("assessment", ""),
            }
        )
        recent = [item["avg_score"] for item in history[-30:] if item.get("avg_score")]
        if recent:
            profile["stats"]["avg_score"] = round(sum(recent) / len(recent), 1)

    if weak_point:
        from backend.vector_memory import find_similar_weak_point

        match_idx = find_similar_weak_point(user_id, weak_point, profile.get("weak_points", []))
        if match_idx is not None:
            profile["weak_points"][match_idx]["times_seen"] = profile["weak_points"][match_idx].get("times_seen", 1) + 1
            profile["weak_points"][match_idx]["last_seen"] = now
        else:
            profile.setdefault("weak_points", []).append(
                {
                    "point": weak_point,
                    "topic": topic or "",
                    "first_seen": now,
                    "last_seen": now,
                    "times_seen": 1,
                    "improved": False,
                }
            )

    profile.setdefault("stats", {}).setdefault("total_answers", 0)
    profile["stats"]["total_answers"] = profile["stats"].get("total_answers", 0) + 1
    _save_profile(user_id, profile)


def get_profile_summary(user_id: str) -> str:
    """Generate a concise summary for interview prompts."""
    profile = _load_profile(user_id)

    parts = []
    if profile.get("weak_points"):
        active_weak = [weak_point for weak_point in profile["weak_points"] if not weak_point.get("improved")]
        if active_weak:
            parts.append(f"已知薄弱点: {', '.join(item['point'] for item in active_weak[:8])}")

    if profile.get("strong_points"):
        parts.append(f"亮点: {', '.join(item['point'] for item in profile['strong_points'][:5])}")

    if profile.get("communication", {}).get("style"):
        parts.append(f"沟通风格: {profile['communication']['style']}")

    thinking_patterns = profile.get("thinking_patterns", {})
    if thinking_patterns.get("gaps"):
        parts.append(f"思维短板: {', '.join(thinking_patterns['gaps'][:5])}")
    if thinking_patterns.get("strengths"):
        parts.append(f"思维优势: {', '.join(thinking_patterns['strengths'][:5])}")

    if profile.get("stats", {}).get("total_sessions"):
        parts.append(f"已完成 {profile['stats']['total_sessions']} 次训练")

    if profile.get("topic_mastery"):
        mastery = ", ".join(
            f"{topic}: {item.get('score', item.get('level', 0) * 20)}/100"
            for topic, item in profile["topic_mastery"].items()
        )
        parts.append(f"掌握度: {mastery}")

    return "\n".join(parts) if parts else "新用户，暂无历史数据"


def get_profile_summary_for_drill(user_id: str) -> str:
    """Concise summary for drill generation, focused on cross-topic signals."""
    profile = _load_profile(user_id)
    parts = []

    if profile.get("communication", {}).get("style"):
        parts.append(f"沟通风格: {profile['communication']['style']}")

    thinking_patterns = profile.get("thinking_patterns", {})
    if thinking_patterns.get("gaps"):
        parts.append(f"思维短板: {', '.join(thinking_patterns['gaps'][:5])}")
    if thinking_patterns.get("strengths"):
        parts.append(f"思维优势: {', '.join(thinking_patterns['strengths'][:5])}")

    if profile.get("stats", {}).get("total_sessions"):
        parts.append(f"已完成 {profile['stats']['total_sessions']} 次训练")

    return "\n".join(parts) if parts else "新用户，暂无历史数据"


def _parse_json_safe(content: str) -> dict | list:
    content = content.strip()
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        pass

    match = re.search(r"```(?:json)?\s*\n?([\s\S]*?)\n?```", content)
    if match:
        try:
            return json.loads(match.group(1).strip())
        except json.JSONDecodeError:
            pass

    for index, char in enumerate(content):
        if char in ("[", "{"):
            try:
                return json.loads(content[index:])
            except json.JSONDecodeError:
                pass
            break

    raise json.JSONDecodeError("No valid JSON found", content, 0)


def _apply_memory_ops(profile: dict, ops: dict, topic: str | None, now: str):
    weak_points = profile.setdefault("weak_points", [])

    for op in ops.get("weak_point_ops", []):
        action = op.get("action", "NOOP")
        if action == "ADD":
            weak_points.append(
                {
                    "point": op["point"],
                    "topic": op.get("topic", topic or ""),
                    "first_seen": now,
                    "last_seen": now,
                    "times_seen": 1,
                    "improved": False,
                }
            )
        elif action == "UPDATE":
            weak_index = op.get("index")
            if weak_index is not None and 0 <= weak_index < len(weak_points):
                weak_point = weak_points[weak_index]
                if op.get("new_point"):
                    weak_point["point"] = op["new_point"]
                weak_point["times_seen"] = weak_point.get("times_seen", 1) + 1
                weak_point["last_seen"] = now

    for improvement in ops.get("improvements", []):
        weak_index = improvement.get("weak_index")
        if weak_index is not None and 0 <= weak_index < len(weak_points):
            weak_points[weak_index]["improved"] = True
            weak_points[weak_index]["improved_at"] = now

    existing_strong = {item["point"] for item in profile.get("strong_points", [])}
    for op in ops.get("strong_point_ops", []):
        if op.get("action") == "ADD" and op.get("point") and op["point"] not in existing_strong:
            profile.setdefault("strong_points", []).append(
                {
                    "point": op["point"],
                    "topic": op.get("topic", topic or ""),
                    "first_seen": now,
                }
            )


def _deterministic_update(
    profile: dict,
    user_id: str,
    new_weak: list,
    new_strong: list,
    topic: str | None,
    now: str,
):
    from backend.vector_memory import find_similar_weak_point

    for weak_point in new_weak:
        point = weak_point.get("point", weak_point) if isinstance(weak_point, dict) else str(weak_point)
        match_idx = find_similar_weak_point(user_id, point, profile.get("weak_points", []))
        if match_idx is not None:
            profile["weak_points"][match_idx]["times_seen"] = profile["weak_points"][match_idx].get("times_seen", 1) + 1
            profile["weak_points"][match_idx]["last_seen"] = now
        else:
            profile.setdefault("weak_points", []).append(
                {
                    "point": point,
                    "topic": weak_point.get("topic", topic) if isinstance(weak_point, dict) else (topic or ""),
                    "first_seen": now,
                    "last_seen": now,
                    "times_seen": 1,
                    "improved": False,
                }
            )

    for strong_point in new_strong:
        point_text = strong_point.get("point", strong_point) if isinstance(strong_point, dict) else str(strong_point)
        for weak_point in profile.get("weak_points", []):
            target_topic = strong_point.get("topic") if isinstance(strong_point, dict) else topic
            if weak_point.get("topic") == target_topic and not weak_point.get("improved"):
                weak_point["improved"] = True
                weak_point["improved_at"] = now
                break

        existing = {item["point"] for item in profile.get("strong_points", [])}
        if point_text not in existing:
            profile.setdefault("strong_points", []).append(
                {
                    "point": point_text,
                    "topic": strong_point.get("topic") if isinstance(strong_point, dict) else (topic or ""),
                    "first_seen": now,
                }
            )


def _update_mastery(profile: dict, topic: str | None, mastery_data: dict, now: str, session_weight: float = 0.7):
    if not mastery_data:
        return

    if "score" in mastery_data or "level" in mastery_data:
        if not topic:
            return
        entries = {topic: mastery_data}
    else:
        entries = mastery_data

    for mastery_topic, data in entries.items():
        if not isinstance(data, dict):
            continue
        existing = profile.setdefault("topic_mastery", {}).setdefault(mastery_topic, {})
        new_score = data.get("score")
        if new_score is not None:
            old_score = existing.get("score", existing.get("level", 0) * 20)
            merged = round(old_score * (1 - session_weight) + new_score * session_weight, 1)
            existing["score"] = merged
            existing.pop("level", None)
        if data.get("notes"):
            existing["notes"] = data["notes"]
        existing["last_assessed"] = now


def _update_communication(profile: dict, communication: dict):
    if not communication:
        return
    if communication.get("style_update"):
        profile.setdefault("communication", {})["style"] = communication["style_update"]
    for habit in communication.get("new_habits", []):
        habits = profile.setdefault("communication", {}).setdefault("habits", [])
        if habit not in habits:
            habits.append(habit)
    for suggestion in communication.get("new_suggestions", []):
        suggestions = profile.setdefault("communication", {}).setdefault("suggestions", [])
        if suggestion not in suggestions:
            suggestions.append(suggestion)


def _update_thinking_patterns(profile: dict, patterns: dict):
    if not patterns:
        return
    thinking_patterns = profile.setdefault("thinking_patterns", {"strengths": [], "gaps": []})
    for strength in patterns.get("new_strengths", []):
        if strength not in thinking_patterns["strengths"]:
            thinking_patterns["strengths"].append(strength)
    for gap in patterns.get("new_gaps", []):
        if gap not in thinking_patterns["gaps"]:
            thinking_patterns["gaps"].append(gap)


def _update_stats(
    profile: dict,
    mode: str,
    topic: str | None,
    avg_score: float | None,
    now: str,
    answer_count: int = 0,
    dimension_scores: dict | None = None,
):
    stats = profile.setdefault("stats", {})
    stats["total_sessions"] = stats.get("total_sessions", 0) + 1
    if mode == "resume":
        stats["resume_sessions"] = stats.get("resume_sessions", 0) + 1
    else:
        stats["drill_sessions"] = stats.get("drill_sessions", 0) + 1

    if answer_count:
        stats["total_answers"] = stats.get("total_answers", 0) + answer_count

    if avg_score is not None:
        history = stats.setdefault("score_history", [])
        entry = {"date": now[:10], "mode": mode, "topic": topic, "avg_score": avg_score}
        if dimension_scores:
            entry["dimension_scores"] = dimension_scores
        history.append(entry)

        drill_scores = [item["avg_score"] for item in history if item.get("mode") == "topic_drill" and item.get("avg_score") is not None][-20:]
        resume_scores = [item["avg_score"] for item in history if item.get("mode") == "resume" and item.get("avg_score") is not None][-10:]

        if drill_scores:
            stats["drill_avg_score"] = round(sum(drill_scores) / len(drill_scores), 1)
        if resume_scores:
            stats["resume_avg_score"] = round(sum(resume_scores) / len(resume_scores), 1)

        all_recent = drill_scores + resume_scores
        if all_recent:
            stats["avg_score"] = round(sum(all_recent) / len(all_recent), 1)


async def llm_update_profile(
    user_id: str,
    mode: str,
    topic: str | None,
    new_weak_points: list[dict],
    new_strong_points: list[dict],
    topic_mastery: dict,
    communication: dict,
    thinking_patterns: dict | None = None,
    session_summary: str = "",
    avg_score: float | None = None,
    answer_count: int = 0,
    session_weight: float = 0.7,
    dimension_scores: dict | None = None,
):
    from backend.prompts.interviewer import PROFILE_UPDATE_PROMPT

    profile = _load_profile(user_id)
    now = datetime.now().isoformat()
    has_new_facts = bool(new_weak_points or new_strong_points)

    if has_new_facts:
        existing_weak_lines = []
        for index, weak_point in enumerate(profile.get("weak_points", [])):
            status = "已改进" if weak_point.get("improved") else f"出现 {weak_point.get('times_seen', 1)} 次"
            existing_weak_lines.append(
                f"[{index}] {weak_point['point']} (领域: {weak_point.get('topic', '?')}, {status})"
            )

        existing_strong_lines = [
            f"[{index}] {strong_point['point']} (领域: {strong_point.get('topic', '?')})"
            for index, strong_point in enumerate(profile.get("strong_points", []))
        ]

        new_weak_lines = []
        for weak_point in new_weak_points:
            point = weak_point.get("point", weak_point) if isinstance(weak_point, dict) else str(weak_point)
            target_topic = weak_point.get("topic", topic) if isinstance(weak_point, dict) else topic
            new_weak_lines.append(f"- {point} (领域: {target_topic})")

        new_strong_lines = []
        for strong_point in new_strong_points:
            point = strong_point.get("point", strong_point) if isinstance(strong_point, dict) else str(strong_point)
            target_topic = strong_point.get("topic", topic) if isinstance(strong_point, dict) else topic
            new_strong_lines.append(f"- {point} (领域: {target_topic})")

        prompt = PROFILE_UPDATE_PROMPT.format(
            existing_weak="\n".join(existing_weak_lines) or "暂无",
            existing_strong="\n".join(existing_strong_lines) or "暂无",
            new_weak="\n".join(new_weak_lines) or "暂无",
            new_strong="\n".join(new_strong_lines) or "暂无",
        )

        llm = get_langchain_llm()
        response = llm.invoke(
            [
                SystemMessage(content="你是画像更新引擎。只返回 JSON。"),
                HumanMessage(content=prompt),
            ]
        )

        try:
            ops = _parse_json_safe(response.content)
            if isinstance(ops, dict):
                _apply_memory_ops(profile, ops, topic, now)
            else:
                raise ValueError(f"Expected dict, got {type(ops)}")
        except (json.JSONDecodeError, ValueError, KeyError) as exc:
            logger.warning("Profile update parse failed (%s), falling back to deterministic update.", exc)
            _deterministic_update(profile, user_id, new_weak_points, new_strong_points, topic, now)

    _update_mastery(profile, topic, topic_mastery, now, session_weight)
    _update_communication(profile, communication)
    _update_thinking_patterns(profile, thinking_patterns)
    _update_stats(profile, mode, topic, avg_score, now, answer_count, dimension_scores)

    _save_profile(user_id, profile)
    _save_insight(
        user_id=user_id,
        mode=mode,
        topic=topic,
        summary=session_summary,
        raw_extraction={
            "weak_points": new_weak_points,
            "strong_points": new_strong_points,
        },
    )

    from backend.vector_memory import index_session_memory

    index_session_memory(
        user_id=user_id,
        session_id=None,
        topic=topic,
        summary=session_summary,
        weak_points=new_weak_points,
        strong_points=new_strong_points,
        insight_text=session_summary,
    )


async def update_profile_after_interview(
    user_id: str,
    mode: str,
    topic: str | None,
    messages: list,
    scores: list[dict] | None = None,
) -> dict:
    """Two-stage profile update: extract then update."""
    profile = _load_profile(user_id)
    llm = get_langchain_llm()

    transcript_lines = []
    for message in messages:
        if hasattr(message, "content"):
            if isinstance(message, HumanMessage):
                transcript_lines.append(f"候选人: {message.content}")
            elif not isinstance(message, SystemMessage):
                transcript_lines.append(f"面试官: {message.content}")

    score_text = ""
    if scores:
        score_text = "\n".join(
            f"- Q: {score.get('question', '?')} -> {score.get('score', '?')}/10 ({score.get('assessment', '')})"
            for score in scores
        )

    topic_key_example = topic or "topic_key"
    extract_message = EXTRACT_PROMPT.format(
        current_profile=json.dumps(profile, ensure_ascii=False)[:2000],
        mode=mode,
        topic=topic or "综合",
        transcript="\n".join(transcript_lines[-60:]),
        scores=score_text or "无",
        topic_key_example=topic_key_example,
    )

    response = llm.invoke(
        [
            SystemMessage(content="你是面试分析引擎。只返回 JSON。"),
            HumanMessage(content=extract_message),
        ]
    )

    try:
        content = response.content.strip()
        if "```" in content:
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
            content = content.strip()
        extraction = json.loads(content)
    except (json.JSONDecodeError, IndexError):
        extraction = {"session_summary": "提取失败", "weak_points": [], "strong_points": []}

    await llm_update_profile(
        user_id=user_id,
        mode=mode,
        topic=topic,
        new_weak_points=extraction.get("weak_points", []),
        new_strong_points=extraction.get("strong_points", []),
        topic_mastery=extraction.get("topic_mastery", {}),
        communication=extraction.get("communication_observations", {}),
        thinking_patterns=extraction.get("thinking_patterns"),
        session_summary=extraction.get("session_summary", ""),
        avg_score=extraction.get("avg_score"),
        dimension_scores=extraction.get("dimension_scores"),
    )
    return extraction
