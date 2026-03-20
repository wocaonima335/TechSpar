"""模式2: 专项强化训练 — 批量出题 + 批量评估（不再使用 LangGraph）."""
import json

from langchain_core.messages import SystemMessage, HumanMessage

from backend.config import settings
from backend.llm_provider import get_langchain_llm
from backend.indexer import retrieve_topic_context, TOPIC_MAP
from backend.memory import get_profile_summary, get_profile_summary_for_drill, get_topic_context_for_drill
from backend.prompts.interviewer import DRILL_QUESTION_GEN_PROMPT, DRILL_BATCH_EVAL_PROMPT

def _get_topic_display() -> dict[str, str]:
    """Dynamic {key: display_name} from topics.json."""
    from backend.indexer import load_topics
    return {k: v["name"] for k, v in load_topics().items()}


# Lazy proxy so existing `TOPIC_DISPLAY.get(k, k)` calls still work
class _DisplayProxy(dict):
    def get(self, key, default=None):   return _get_topic_display().get(key, default)
    def __getitem__(self, key):         return _get_topic_display()[key]
    def __contains__(self, key):        return key in _get_topic_display()

TOPIC_DISPLAY = _DisplayProxy()


def _parse_json_response(content: str) -> dict | list:
    """Extract JSON from LLM response, handling various formats."""
    import re
    content = content.strip()

    # Try direct parse first
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        pass

    # Extract from markdown code block
    m = re.search(r"```(?:json)?\s*\n?([\s\S]*?)\n?```", content)
    if m:
        try:
            return json.loads(m.group(1).strip())
        except json.JSONDecodeError:
            pass

    # Find first [ or { and parse from there
    for i, c in enumerate(content):
        if c in ("[", "{"):
            try:
                return json.loads(content[i:])
            except json.JSONDecodeError:
                pass
            break

    raise json.JSONDecodeError("No valid JSON found", content, 0)


def _load_high_freq(topic: str) -> str:
    """Load high-frequency question bank for a topic."""
    from backend.config import settings
    filepath = settings.high_freq_path / f"{topic}.md"
    if filepath.exists():
        return filepath.read_text(encoding="utf-8").strip()
    return ""


def generate_drill_questions(topic: str) -> list[dict]:
    """Generate 10 personalized questions for a topic. 1 LLM call."""
    from backend.spaced_repetition import get_due_reviews, init_sr_for_existing_points

    # Ensure existing weak points have SR state
    init_sr_for_existing_points()

    topic_name = TOPIC_DISPLAY.get(topic, topic)
    drill_ctx = get_topic_context_for_drill(topic)

    # Spaced repetition: prioritize due reviews
    due_reviews = get_due_reviews(topic)
    due_points = [wp["point"] for wp in due_reviews[:5]]

    all_weak = list(drill_ctx["weak_points"])
    for dp in due_points:
        if dp not in all_weak:
            all_weak.insert(0, dp)

    # Retrieve knowledge — prioritize weak areas
    queries = []
    if all_weak:
        queries.append(" ".join(all_weak[:5]))
    queries.append(f"{topic_name} 核心知识点 面试常见问题")

    all_chunks = []
    for q in queries:
        all_chunks.extend(retrieve_topic_context(topic, q, top_k=5))
    # Deduplicate and limit
    seen = set()
    unique_chunks = []
    for c in all_chunks:
        key = c[:100]
        if key not in seen:
            seen.add(key)
            unique_chunks.append(c)
    knowledge_ctx = "\n\n---\n\n".join(unique_chunks)[:5000]

    # Format past insights from vector retrieval
    past_insights_text = "\n".join(
        f"- {ins[:200]}" for ins in drill_ctx.get("past_insights", [])
    ) or "暂无历史数据"

    # Load high-frequency questions
    high_freq = _load_high_freq(topic) or "暂无"

    # Format weak points, marking due reviews
    weak_lines = []
    for w in all_weak[:10]:
        prefix = "[到期复习] " if w in due_points else ""
        weak_lines.append(f"- {prefix}{w}")

    prompt = DRILL_QUESTION_GEN_PROMPT.format(
        topic_name=topic_name,
        knowledge_context=knowledge_ctx,
        user_profile=get_profile_summary_for_drill(),
        mastery_info=drill_ctx["mastery_info"],
        weak_points="\n".join(weak_lines) or "暂无",
        high_freq_questions=high_freq,
        recent_questions="\n".join(f"- {q}" for q in drill_ctx["recent_questions"][-10:]) or "暂无",
        past_insights=past_insights_text,
    )

    llm = get_langchain_llm()
    response = llm.invoke([
        SystemMessage(content="你是专项训练出题引擎。只返回 JSON 数组，不要其他内容。"),
        HumanMessage(content=prompt),
    ])

    try:
        questions = _parse_json_response(response.content)
        if not isinstance(questions, list):
            raise ValueError(f"Expected a list, got {type(questions)}")
        # Ensure each question has an id
        for i, q in enumerate(questions):
            if "id" not in q:
                q["id"] = i + 1
        return questions[:10]
    except (json.JSONDecodeError, ValueError, IndexError) as e:
        import logging
        logger = logging.getLogger("uvicorn")
        logger.error(f"Drill question generation failed: {e}")
        logger.error(f"LLM raw response: {response.content[:500]}")
        raise RuntimeError(f"出题失败，LLM 返回格式异常: {e}")


def evaluate_drill_answers(topic: str, questions: list[dict], answers: list[dict]) -> dict:
    """Batch evaluate all answers. 1 LLM call."""
    topic_name = TOPIC_DISPLAY.get(topic, topic)
    answer_map = {a["question_id"]: a["answer"] for a in answers}

    # Only evaluate answered questions
    answered_questions = [q for q in questions if answer_map.get(q["id"])]

    qa_lines = []
    ref_lines = []
    for q in answered_questions:
        qid = q["id"]
        answer = answer_map[qid]
        qa_lines.append(f"### Q{qid} (难度 {q.get('difficulty', '?')}/5)\n**题目**: {q['question']}\n**回答**: {answer}")

        refs = retrieve_topic_context(topic, q["question"], top_k=2)
        if refs:
            ref_lines.append(f"### Q{qid} 参考\n" + "\n".join(refs)[:800])

    prompt = DRILL_BATCH_EVAL_PROMPT.format(
        topic_name=topic_name,
        topic_key=topic,
        qa_pairs="\n\n".join(qa_lines),
        references="\n\n".join(ref_lines)[:4000],
    )

    llm = get_langchain_llm()
    response = llm.invoke([
        SystemMessage(content="你是训练评估引擎。只返回 JSON，不要其他内容。"),
        HumanMessage(content=prompt),
    ])

    try:
        result = _parse_json_response(response.content)
        if not isinstance(result, dict):
            raise ValueError(f"Expected a dict, got {type(result)}")
        return result
    except (json.JSONDecodeError, ValueError, IndexError) as e:
        import logging
        logger = logging.getLogger("uvicorn")
        logger.error(f"Drill evaluation failed: {e}")
        logger.error(f"LLM raw response: {response.content[:500]}")
        # Evaluation fallback is acceptable — better than crashing
        return {
            "scores": [{"question_id": q["id"], "score": None, "assessment": "评估解析失败，请重试"} for q in questions],
            "overall": {"avg_score": None, "summary": "评估结果解析失败，请重新提交。", "new_weak_points": [], "new_strong_points": []},
        }
