"""Resume interview graph backed by LangGraph."""

from __future__ import annotations

import json
import logging
import re

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph

from backend.config import settings
from backend.indexer import query_resume
from backend.llm_provider import get_langchain_llm
from backend.memory import get_profile_summary
from backend.models import InterviewPhase, ResumeInterviewState
from backend.prompts.interviewer import RESUME_INTERVIEWER_SYSTEM

logger = logging.getLogger("uvicorn")

PHASE_ORDER = [
    InterviewPhase.GREETING.value,
    InterviewPhase.SELF_INTRO.value,
    InterviewPhase.TECHNICAL.value,
    InterviewPhase.PROJECT_DEEP_DIVE.value,
    InterviewPhase.REVERSE_QA.value,
]
HARD_MAX_PER_PHASE = 10
_EVAL_PATTERN = re.compile(r"<!--EVAL:(.*?)-->", re.DOTALL)


def _parse_inline_eval(content: str) -> tuple[str, dict | None]:
    """Extract and strip hidden eval JSON from interviewer response."""
    match = _EVAL_PATTERN.search(content)
    if not match:
        return content, None

    clean = _EVAL_PATTERN.sub("", content).rstrip()
    try:
        eval_data = json.loads(match.group(1))
        return clean, eval_data
    except json.JSONDecodeError:
        logger.warning("Failed to parse inline eval: %s", match.group(1)[:100])
        return clean, None


def init_interview(state: ResumeInterviewState, user_id: str) -> dict:
    """Load resume context and prepare the opening."""
    resume_ctx = query_resume(user_id, "列出候选人的所有项目经历、技术栈和教育背景")

    system_prompt = RESUME_INTERVIEWER_SYSTEM.format(
        resume_context=resume_ctx,
        phase=InterviewPhase.GREETING.value,
        asked_questions="无",
        user_profile=get_profile_summary(user_id),
    )

    llm = get_langchain_llm()
    response = llm.invoke(
        [
            SystemMessage(content=system_prompt),
            HumanMessage(content="面试开始，请开场并让候选人做自我介绍。"),
        ]
    )

    return {
        "messages": [response],
        "resume_context": resume_ctx,
        "phase": InterviewPhase.GREETING.value,
        "questions_asked": [],
        "phase_question_count": 0,
        "is_finished": False,
        "eval_history": [],
    }


def interviewer_ask(state: ResumeInterviewState, user_id: str) -> dict:
    """Generate the next interview question."""
    asked = state.get("questions_asked", [])
    asked_str = "\n".join(f"- {question}" for question in asked) if asked else "无"

    system_prompt = RESUME_INTERVIEWER_SYSTEM.format(
        resume_context=state.get("resume_context", ""),
        phase=state.get("phase", "technical"),
        asked_questions=asked_str,
        user_profile=get_profile_summary(user_id),
    )

    llm = get_langchain_llm()
    messages = [SystemMessage(content=system_prompt)] + list(state.get("messages", []))
    response = llm.invoke(messages)

    clean_content, eval_data = _parse_inline_eval(response.content)
    count = state.get("phase_question_count", 0)

    result = {
        "messages": [AIMessage(content=clean_content)],
        "questions_asked": asked + [clean_content[:100]],
        "phase_question_count": count + 1,
    }

    if eval_data:
        eval_data["phase"] = state.get("phase", "")
        eval_data["question_index"] = count
        result["last_eval"] = eval_data
        result["eval_history"] = list(state.get("eval_history", [])) + [eval_data]
        logger.info(
            "Inline eval: phase=%s score=%s should_advance=%s",
            eval_data["phase"],
            eval_data.get("score"),
            eval_data.get("should_advance"),
        )

    return result


def route_after_answer(state: ResumeInterviewState) -> str:
    """After the user's answer, keep asking, advance, or end."""
    if state.get("is_finished"):
        return "end"

    phase = state.get("phase", "greeting")
    count = state.get("phase_question_count", 0)
    last_eval = state.get("last_eval")

    if count >= HARD_MAX_PER_PHASE:
        return "advance"

    if phase == "greeting" and count >= 1:
        return "advance"
    if phase == "self_intro" and count >= 2:
        return "advance"
    if phase == "reverse_qa" and count >= 2:
        return "end"

    if phase in ("technical", "project_deep_dive"):
        if count >= 2 and last_eval and last_eval.get("should_advance"):
            logger.info("Eval-driven advance: %s after %s questions", phase, count)
            return "advance"

        if count >= settings.max_questions_per_phase:
            return "advance"

    return "ask"


def advance_phase(state: ResumeInterviewState) -> dict:
    """Move to the next interview phase."""
    current_phase = state.get("phase", "greeting")
    try:
        index = PHASE_ORDER.index(current_phase)
    except ValueError:
        return {"is_finished": True}

    if index >= len(PHASE_ORDER) - 1:
        return {"is_finished": True}

    return {
        "phase": PHASE_ORDER[index + 1],
        "phase_question_count": 0,
        "last_eval": {},
    }


def wait_for_answer(state: ResumeInterviewState) -> dict:
    """Graph pauses here for user input."""
    return {}


def compile_resume_interview(user_id: str):
    """Build and compile the resume interview graph for one user."""
    graph = StateGraph(ResumeInterviewState)

    graph.add_node("init", lambda state: init_interview(state, user_id))
    graph.add_node("ask", lambda state: interviewer_ask(state, user_id))
    graph.add_node("advance", advance_phase)
    graph.add_node("wait", wait_for_answer)

    graph.add_edge(START, "init")
    graph.add_edge("init", "wait")
    graph.add_edge("ask", "wait")
    graph.add_edge("advance", "ask")

    graph.add_conditional_edges(
        "wait",
        route_after_answer,
        {
            "ask": "ask",
            "advance": "advance",
            "end": END,
        },
    )

    return graph.compile(
        checkpointer=MemorySaver(),
        interrupt_before=["wait"],
    )
