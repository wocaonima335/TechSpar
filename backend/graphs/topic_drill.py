"""Topic drill generation and evaluation helpers."""

from __future__ import annotations

import json

from langchain_core.messages import HumanMessage, SystemMessage

from backend.indexer import TOPIC_MAP, retrieve_topic_context
from backend.llm_provider import get_langchain_llm
from backend.memory import get_profile_summary_for_drill, get_topic_context_for_drill
from backend.prompts.interviewer import DRILL_BATCH_EVAL_PROMPT, DRILL_QUESTION_GEN_PROMPT


def _get_topic_display() -> dict[str, str]:
    from backend.indexer import load_topics

    return {key: value["name"] for key, value in load_topics().items()}


class _DisplayProxy(dict):
    def get(self, key, default=None):
        return _get_topic_display().get(key, default)

    def __getitem__(self, key):
        return _get_topic_display()[key]

    def __contains__(self, key):
        return key in _get_topic_display()


TOPIC_DISPLAY = _DisplayProxy()


def _parse_json_response(content: str) -> dict | list:
    import re

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


def _load_high_freq(topic: str) -> str:
    from backend.config import settings

    filepath = settings.high_freq_path / f"{topic}.md"
    if filepath.exists():
        return filepath.read_text(encoding="utf-8").strip()
    return ""


def generate_drill_questions(user_id: str, topic: str) -> list[dict]:
    """Generate personalized drill questions for one user."""
    from backend.spaced_repetition import get_due_reviews, init_sr_for_existing_points

    init_sr_for_existing_points(user_id)

    topic_name = TOPIC_DISPLAY.get(topic, topic)
    drill_ctx = get_topic_context_for_drill(user_id, topic)

    due_reviews = get_due_reviews(user_id, topic)
    due_points = [item["point"] for item in due_reviews[:5]]

    all_weak = list(drill_ctx["weak_points"])
    for due_point in due_points:
        if due_point not in all_weak:
            all_weak.insert(0, due_point)

    queries = []
    if all_weak:
        queries.append(" ".join(all_weak[:5]))
    queries.append(f"{topic_name} 核心知识点 面试常见问题")

    all_chunks = []
    for query in queries:
        all_chunks.extend(retrieve_topic_context(topic, query, top_k=5))

    seen = set()
    unique_chunks = []
    for chunk in all_chunks:
        key = chunk[:100]
        if key not in seen:
            seen.add(key)
            unique_chunks.append(chunk)
    knowledge_ctx = "\n\n---\n\n".join(unique_chunks)[:5000]

    past_insights_text = "\n".join(f"- {insight[:200]}" for insight in drill_ctx.get("past_insights", [])) or "暂无历史数据"
    high_freq = _load_high_freq(topic) or "暂无"

    weak_lines = []
    for weak_point in all_weak[:10]:
        prefix = "[到期复习] " if weak_point in due_points else ""
        weak_lines.append(f"- {prefix}{weak_point}")

    prompt = DRILL_QUESTION_GEN_PROMPT.format(
        topic_name=topic_name,
        knowledge_context=knowledge_ctx,
        user_profile=get_profile_summary_for_drill(user_id),
        mastery_info=drill_ctx["mastery_info"],
        weak_points="\n".join(weak_lines) or "暂无",
        high_freq_questions=high_freq,
        recent_questions="\n".join(f"- {question}" for question in drill_ctx["recent_questions"][-10:]) or "暂无",
        past_insights=past_insights_text,
    )

    llm = get_langchain_llm()
    response = llm.invoke(
        [
            SystemMessage(content="你是专项训练出题引擎。只返回 JSON 数组，不要额外说明。"),
            HumanMessage(content=prompt),
        ]
    )

    try:
        questions = _parse_json_response(response.content)
        if not isinstance(questions, list):
            raise ValueError(f"Expected a list, got {type(questions)}")
        for index, question in enumerate(questions):
            if "id" not in question:
                question["id"] = index + 1
        return questions[:10]
    except (json.JSONDecodeError, ValueError, IndexError) as exc:
        import logging

        logger = logging.getLogger("uvicorn")
        logger.error("Drill question generation failed: %s", exc)
        logger.error("LLM raw response: %s", response.content[:500])
        raise RuntimeError(f"出题失败，LLM 返回格式异常: {exc}")


def evaluate_drill_answers(topic: str, questions: list[dict], answers: list[dict]) -> dict:
    """Batch-evaluate answered drill questions."""
    topic_name = TOPIC_DISPLAY.get(topic, topic)
    answer_map = {answer["question_id"]: answer["answer"] for answer in answers}
    answered_questions = [question for question in questions if answer_map.get(question["id"])]

    qa_lines = []
    ref_lines = []
    for question in answered_questions:
        question_id = question["id"]
        answer = answer_map[question_id]
        qa_lines.append(
            f"### Q{question_id} (难度 {question.get('difficulty', '?')}/5)\n"
            f"**题目**: {question['question']}\n"
            f"**回答**: {answer}"
        )

        refs = retrieve_topic_context(topic, question["question"], top_k=2)
        if refs:
            ref_lines.append(f"### Q{question_id} 参考\n" + "\n".join(refs)[:800])

    prompt = DRILL_BATCH_EVAL_PROMPT.format(
        topic_name=topic_name,
        topic_key=topic,
        qa_pairs="\n\n".join(qa_lines),
        references="\n\n".join(ref_lines)[:4000],
    )

    llm = get_langchain_llm()
    response = llm.invoke(
        [
            SystemMessage(content="你是训练评估引擎。只返回 JSON，不要额外说明。"),
            HumanMessage(content=prompt),
        ]
    )

    try:
        result = _parse_json_response(response.content)
        if not isinstance(result, dict):
            raise ValueError(f"Expected a dict, got {type(result)}")
        return result
    except (json.JSONDecodeError, ValueError, IndexError) as exc:
        import logging

        logger = logging.getLogger("uvicorn")
        logger.error("Drill evaluation failed: %s", exc)
        logger.error("LLM raw response: %s", response.content[:500])
        return {
            "scores": [
                {"question_id": question["id"], "score": None, "assessment": "评估解析失败，请重试"}
                for question in questions
            ],
            "overall": {
                "avg_score": None,
                "summary": "评估结果解析失败，请重新提交。",
                "new_weak_points": [],
                "new_strong_points": [],
            },
        }
