"""FastAPI 入口 — 面试模拟系统 API."""
import uuid
from datetime import datetime

from fastapi import FastAPI, APIRouter, HTTPException, BackgroundTasks, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from langchain_core.messages import HumanMessage, AIMessage

from backend.models import (
    StartInterviewRequest, ChatRequest, EndDrillRequest,
    InterviewMode, InterviewPhase,
)
from backend.graphs.resume_interview import compile_resume_interview
from backend.graphs.topic_drill import (
    generate_drill_questions, evaluate_drill_answers, TOPIC_DISPLAY,
)
from backend.graphs.review import generate_review
from backend.config import settings
from backend.indexer import TOPIC_MAP, load_topics, save_topics, _index_cache
from backend.memory import get_profile, update_profile_after_interview, llm_update_profile
from backend.storage.sessions import (
    create_session, append_message, save_review, save_drill_answers,
    get_session, list_sessions, list_sessions_by_topic,
    delete_session, list_distinct_topics,
)
from backend.graph import build_graph

app = FastAPI(title="TechSpar", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

router = APIRouter(prefix="/api")

# In-memory graph instances keyed by session_id (resume mode only)
_graphs: dict[str, dict] = {}
# Drill session data (questions stored for evaluation at end)
_drill_sessions: dict[str, dict] = {}


@app.on_event("startup")
def preload_models():
    """Pre-load bge-m3 embedding model + init vector memory on startup."""
    from backend.llm_provider import get_embedding, get_llama_llm
    from backend.indexer import _init_llama_settings
    from backend.vector_memory import init_memory_table, rebuild_index_from_profile
    import logging
    logger = logging.getLogger("uvicorn")
    logger.info("Pre-loading bge-m3 embedding model...")
    get_embedding()
    _init_llama_settings()
    logger.info("Embedding model ready.")

    # Init vector memory table and backfill from existing profile
    init_memory_table()
    try:
        rebuild_index_from_profile()
    except Exception as e:
        logger.warning(f"Profile backfill skipped: {e}")
    logger.info("Vector memory initialized.")


@router.get("/")
def root():
    return {"service": "TechSpar", "version": "0.1.0"}


@router.get("/resume/status")
def resume_status():
    """Check if a resume file exists."""
    resume_dir = settings.resume_path
    if not resume_dir.exists():
        return {"has_resume": False}
    files = [f for f in resume_dir.iterdir() if f.suffix.lower() == ".pdf"]
    if not files:
        return {"has_resume": False}
    f = files[0]
    return {"has_resume": True, "filename": f.name, "size": f.stat().st_size}


@router.post("/resume/upload")
async def upload_resume(file: UploadFile = File(...)):
    """Upload a resume PDF. Replaces any existing resume."""
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Only PDF files are supported.")

    resume_dir = settings.resume_path
    resume_dir.mkdir(parents=True, exist_ok=True)

    # Remove old resumes
    for old in resume_dir.iterdir():
        if old.is_file():
            old.unlink()

    # Save new file
    dest = resume_dir / file.filename
    content = await file.read()
    dest.write_bytes(content)

    # Clear index cache so next query rebuilds from new resume
    _index_cache.pop("resume", None)
    cache_dir = settings.base_dir / "data" / ".index_cache" / "resume"
    if cache_dir.exists():
        import shutil
        shutil.rmtree(cache_dir)

    return {"ok": True, "filename": file.filename, "size": len(content)}


# ── Speech-to-text ──

@router.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    """Transcribe audio to text using FunASR Paraformer-zh."""
    audio_bytes = await file.read()
    if not audio_bytes:
        raise HTTPException(400, "Empty audio file.")

    try:
        from backend.transcribe import transcribe_audio
        suffix = "." + (file.filename or "audio.webm").rsplit(".", 1)[-1]
        text = transcribe_audio(audio_bytes, suffix=suffix)
        return {"text": text}
    except ImportError:
        raise HTTPException(501, "FunASR not installed. Run: pip install funasr")
    except Exception as e:
        raise HTTPException(500, f"Transcription failed: {e}")


@router.get("/topics")
def get_topics():
    """List available drill topics (with name and icon)."""
    return load_topics()


@router.post("/topics")
def create_topic(body: dict):
    """Add a new topic."""
    key = body.get("key", "").strip()
    name = body.get("name", "").strip()
    icon = body.get("icon", "📝").strip()
    if not key or not name:
        raise HTTPException(400, "key and name are required")

    topics = load_topics()
    if key in topics:
        raise HTTPException(409, f"Topic '{key}' already exists")

    dir_name = body.get("dir", key).strip()
    topics[key] = {"name": name, "icon": icon, "dir": dir_name}
    save_topics(topics)

    # Create knowledge directory with README
    topic_dir = settings.knowledge_path / dir_name
    topic_dir.mkdir(parents=True, exist_ok=True)
    readme = topic_dir / "README.md"
    if not readme.exists():
        readme.write_text(f"# {name}\n", encoding="utf-8")

    return {"ok": True, "key": key}


@router.delete("/topics/{key}")
def delete_topic(key: str):
    """Remove a topic."""
    topics = load_topics()
    if key not in topics:
        raise HTTPException(404, f"Topic '{key}' not found")

    del topics[key]
    save_topics(topics)

    # Clear index cache
    from backend.indexer import _index_cache
    _index_cache.pop(key, None)

    return {"ok": True}


@router.get("/profile")
def get_user_profile():
    """Get the user's accumulated interview profile."""
    return get_profile()


@router.get("/profile/due-reviews")
def get_due_reviews(topic: str = None):
    """Get weak points due for spaced repetition review."""
    from backend.spaced_repetition import get_due_reviews as _get_due
    return _get_due(topic)


@router.get("/profile/topic/{topic}/history")
def get_topic_history(topic: str):
    """Get session history for a specific topic."""
    sessions = list_sessions_by_topic(topic)
    return sessions


@router.post("/profile/topic/{topic}/retrospective")
async def generate_retrospective(topic: str):
    """Generate a comprehensive retrospective for a topic based on all past sessions."""
    from backend.prompts.interviewer import TOPIC_RETROSPECTIVE_PROMPT
    from backend.memory import _load_profile, _save_profile
    from backend.llm_provider import get_langchain_llm
    from backend.graphs.topic_drill import TOPIC_DISPLAY
    from langchain_core.messages import SystemMessage, HumanMessage

    # Gather all sessions for this topic
    sessions = list_sessions_by_topic(topic)
    if not sessions:
        raise HTTPException(400, "该领域暂无训练记录")

    profile = _load_profile()
    topic_name = TOPIC_DISPLAY.get(topic, topic)
    mastery = profile.get("topic_mastery", {}).get(topic, {})

    # Format session history — only include answered questions
    history_lines = []
    for s in sessions:
        date = s["created_at"][:10]
        scores = s.get("scores", [])
        valid_scores = [sc for sc in scores if isinstance(sc.get("score"), (int, float))]
        avg = round(sum(sc["score"] for sc in valid_scores) / len(valid_scores), 1) if valid_scores else None

        # Summary section only (before per-question breakdown)
        review = s.get("review") or ""
        summary_part = review.split("## 逐题复盘")[0].strip()

        # Per-question scores — answered only
        score_lines = []
        for sc in valid_scores:
            line = f"- Q{sc.get('question_id', '?')}: {sc['score']}/10"
            if sc.get("assessment"):
                line += f" — {sc['assessment']}"
            score_lines.append(line)

        history_lines.append(
            f"### {date} (答题 {len(valid_scores)}/10, 平均 {avg or '无'}/10)\n"
            f"{summary_part}\n"
            + ("\n".join(score_lines) + "\n" if score_lines else "")
        )

    mastery_score = mastery.get("score", mastery.get("level", 0) * 20)
    mastery_text = f"{mastery_score}/100 — {mastery.get('notes', '')}" if mastery_score > 0 else "暂无评估"

    prompt = TOPIC_RETROSPECTIVE_PROMPT.format(
        topic_name=topic_name,
        session_history="\n".join(history_lines),
        mastery_info=mastery_text,
    )

    llm = get_langchain_llm()
    response = llm.invoke([
        SystemMessage(content="你是面试教练。用 markdown 生成回顾报告。"),
        HumanMessage(content=prompt),
    ])

    retrospective = response.content.strip()

    # Cache in profile
    profile.setdefault("topic_mastery", {}).setdefault(topic, {})["retrospective"] = retrospective
    profile["topic_mastery"][topic]["retrospective_at"] = datetime.now().isoformat()
    _save_profile(profile)

    return {
        "topic": topic,
        "topic_name": topic_name,
        "retrospective": retrospective,
        "session_count": len(sessions),
    }


@router.post("/interview/start")
async def start_interview(req: StartInterviewRequest):
    """Start a new interview session."""
    session_id = str(uuid.uuid4())[:8]

    if req.mode == InterviewMode.TOPIC_DRILL:
        # ── Drill mode: generate 10 questions upfront ──
        if not req.topic or req.topic not in TOPIC_MAP:
            raise HTTPException(400, f"Invalid topic. Available: {list(TOPIC_MAP.keys())}")

        try:
            questions = generate_drill_questions(req.topic)
        except RuntimeError as e:
            raise HTTPException(500, str(e))
        create_session(session_id, req.mode.value, req.topic, questions=questions)
        _drill_sessions[session_id] = {"topic": req.topic, "questions": questions}

        return {
            "session_id": session_id,
            "mode": req.mode.value,
            "topic": req.topic,
            "questions": questions,
        }
    else:
        # ── Resume mode: LangGraph interactive interview ──
        graph = compile_resume_interview()
        initial_state = {}
        config = {"configurable": {"thread_id": session_id}}

        result = graph.invoke(initial_state, config)

        ai_message = ""
        for msg in reversed(result["messages"]):
            if isinstance(msg, AIMessage):
                ai_message = msg.content
                break

        create_session(session_id, req.mode.value, req.topic)
        append_message(session_id, "assistant", ai_message)
        _graphs[session_id] = {"graph": graph, "config": config, "mode": req.mode, "topic": req.topic}

        return {
            "session_id": session_id,
            "mode": req.mode.value,
            "topic": req.topic,
            "message": ai_message,
        }


@router.post("/interview/chat")
async def chat(req: ChatRequest):
    """Send user answer, get next interviewer response (resume mode only)."""
    if req.session_id not in _graphs:
        raise HTTPException(404, "Session not found. It may have expired (in-memory only).")

    entry = _graphs[req.session_id]
    graph = entry["graph"]
    config = entry["config"]

    result = graph.invoke(
        {"messages": [HumanMessage(content=req.message)]},
        config,
    )

    append_message(req.session_id, "user", req.message)

    is_finished = False
    if isinstance(result, dict):
        is_finished = result.get("is_finished", False)
        phase = result.get("phase", "")
        if phase in (InterviewPhase.END.value, "end"):
            is_finished = True

    ai_message = ""
    for msg in reversed(result["messages"]):
        if isinstance(msg, AIMessage):
            ai_message = msg.content
            break

    append_message(req.session_id, "assistant", ai_message)

    return {
        "session_id": req.session_id,
        "message": ai_message,
        "is_finished": is_finished,
    }


@router.post("/interview/end/{session_id}")
async def end_interview(session_id: str, body: EndDrillRequest = None):
    """End interview → evaluate → generate review → update profile."""

    # ── Drill mode: batch evaluate ──
    if session_id in _drill_sessions:
        entry = _drill_sessions[session_id]
        topic = entry["topic"]
        questions = entry["questions"]
        answers = body.answers if body and body.answers else []

        # Save answers to SQLite
        save_drill_answers(session_id, answers)

        # Batch evaluate (1 LLM call)
        eval_result = evaluate_drill_answers(topic, questions, answers)
        scores = eval_result.get("scores", [])
        overall = eval_result.get("overall", {})

        # Attach difficulty from questions to scores (for mastery calculation)
        q_diff = {q["id"]: q.get("difficulty", 3) for q in questions}
        for s in scores:
            s.setdefault("difficulty", q_diff.get(s.get("question_id"), 3))

        # Generate review text from eval
        review = _format_drill_review(questions, answers, scores, overall)

        # Save to SQLite
        save_review(session_id, review, scores, overall.get("new_weak_points", []), overall)

        # Update spaced repetition state for evaluated weak points
        from backend.spaced_repetition import update_weak_point_sr
        for s in scores:
            wp = s.get("weak_point")
            sc = s.get("score")
            if wp and isinstance(sc, (int, float)):
                update_weak_point_sr(topic, wp, sc)

        # Update profile (1 LLM call via Mem0 pipeline — uses overall data)
        await _update_drill_profile(topic, overall, scores, len(questions))

        del _drill_sessions[session_id]

        return {
            "session_id": session_id,
            "mode": "topic_drill",
            "review": review,
            "scores": scores,
            "overall": overall,
        }

    # ── Resume mode: existing flow ──
    if session_id not in _graphs:
        raise HTTPException(404, "Session not found.")

    entry = _graphs[session_id]
    graph = entry["graph"]
    config = entry["config"]

    state = graph.get_state(config)
    messages = state.values.get("messages", [])
    scores = state.values.get("scores", [])
    weak_points = state.values.get("weak_points", [])
    eval_history = state.values.get("eval_history", [])
    topic_name = state.values.get("topic_name", entry.get("topic"))

    review = generate_review(
        mode=entry["mode"],
        messages=messages,
        scores=scores,
        weak_points=weak_points,
        topic=topic_name,
        eval_history=eval_history,
    )

    extraction = await update_profile_after_interview(
        mode=entry["mode"].value,
        topic=entry.get("topic"),
        messages=messages,
        scores=scores,
    )

    # Persist dimension_scores + avg_score into session for later review loading
    resume_overall = {}
    if extraction.get("dimension_scores"):
        resume_overall["dimension_scores"] = extraction["dimension_scores"]
    if extraction.get("avg_score"):
        resume_overall["avg_score"] = extraction["avg_score"]
    save_review(session_id, review, scores, weak_points, overall=resume_overall)

    del _graphs[session_id]

    return {
        "session_id": session_id,
        "mode": "resume",
        "review": review,
        "profile_update": {
            "new_weak_points": extraction.get("weak_points", []),
            "new_strong_points": extraction.get("strong_points", []),
            "session_summary": extraction.get("session_summary", ""),
        },
        "dimension_scores": extraction.get("dimension_scores"),
        "avg_score": extraction.get("avg_score"),
    }


def _format_drill_review(questions, answers, scores, overall) -> str:
    """Format drill evaluation into a readable review string."""
    answer_map = {a["question_id"]: a["answer"] for a in answers}
    score_map = {s["question_id"]: s for s in scores}

    lines = [f"## 整体评价\n\n{overall.get('summary', '')}\n\n**平均分: {overall.get('avg_score', '-')}/10**\n"]

    lines.append("---\n\n## 逐题复盘\n")
    for q in questions:
        qid = q["id"]
        s = score_map.get(qid, {})
        answer = answer_map.get(qid, "")

        # Unanswered: one-line summary only
        if not answer:
            lines.append(f"### Q{qid} ({q.get('focus_area', '')}) — 未作答")
            lines.append(f"**题目**: {q['question']}\n")
            continue

        score = s.get("score", "-")
        assessment = s.get("assessment", "")
        understanding = s.get("understanding", "")
        missing = s.get("key_missing", [])

        lines.append(f"### Q{qid} ({q.get('focus_area', '')}) — {score}/10")
        lines.append(f"**题目**: {q['question']}")
        lines.append(f"**你的回答**: {answer}")
        if assessment:
            lines.append(f"**点评**: {assessment}")
        improvement = s.get("improvement", "")
        if improvement:
            lines.append(f"**改进建议**: {improvement}")
        if understanding:
            lines.append(f"**理解程度**: {understanding}")
        if missing:
            lines.append(f"**遗漏关键点**: {', '.join(missing)}")
        lines.append("")

    if overall.get("new_weak_points"):
        lines.append("---\n\n## 薄弱点")
        for wp in overall["new_weak_points"]:
            lines.append(f"- {wp.get('point', wp) if isinstance(wp, dict) else wp}")

    if overall.get("new_strong_points"):
        lines.append("\n## 亮点")
        for sp in overall["new_strong_points"]:
            lines.append(f"- {sp.get('point', sp) if isinstance(sp, dict) else sp}")

    return "\n".join(lines)


async def _update_drill_profile(topic: str, overall: dict, scores: list, total_questions: int = 10):
    """Update profile from drill evaluation — Mem0-style LLM update."""
    # Compute mastery score (0-100) from per-question scores + difficulty
    valid = []
    for s in scores:
        try:
            valid.append((float(s["score"]), float(s.get("difficulty", 3))))
        except (TypeError, ValueError, KeyError):
            pass
    mastery = overall.get("topic_mastery", {})
    coverage = len(valid) / total_questions if total_questions else 0
    session_weight = coverage * 0.4  # 1/10 answered → 0.04, 10/10 → 0.4

    if valid:
        # contribution = (difficulty/5) × (score/10), unanswered = 0
        contributions = [(d / 5) * (s / 10) for s, d in valid]
        mastery["score"] = round(sum(contributions) / total_questions * 100, 1)
    mastery.pop("level", None)  # migrate away from old Lv1-5

    await llm_update_profile(
        mode="topic_drill",
        topic=topic,
        new_weak_points=overall.get("new_weak_points", []),
        new_strong_points=overall.get("new_strong_points", []),
        topic_mastery=mastery,
        communication=overall.get("communication_observations", {}),
        thinking_patterns=overall.get("thinking_patterns"),
        session_summary=overall.get("summary", ""),
        avg_score=overall.get("avg_score"),
        answer_count=len(scores),
        session_weight=session_weight,
    )


# ── Knowledge management endpoints ──

@router.get("/knowledge/{topic}/core")
async def get_core_knowledge(topic: str):
    """List core knowledge files for a topic."""
    if topic not in TOPIC_MAP:
        raise HTTPException(400, f"Unknown topic: {topic}")
    from backend.config import settings
    topic_dir = settings.knowledge_path / TOPIC_MAP[topic]
    if not topic_dir.exists():
        return []
    files = []
    for f in sorted(topic_dir.glob("*.md")):
        files.append({"filename": f.name, "content": f.read_text(encoding="utf-8")})
    return files


@router.put("/knowledge/{topic}/core/{filename}")
async def update_core_knowledge(topic: str, filename: str, body: dict):
    """Update a core knowledge file."""
    if topic not in TOPIC_MAP:
        raise HTTPException(400, f"Unknown topic: {topic}")
    from backend.config import settings
    topic_dir = settings.knowledge_path / TOPIC_MAP[topic]
    filepath = topic_dir / filename
    if not filepath.exists():
        raise HTTPException(404, f"File not found: {filename}")
    filepath.write_text(body.get("content", ""), encoding="utf-8")
    # Clear index cache so next retrieval rebuilds
    from backend.indexer import _index_cache
    _index_cache.pop(topic, None)
    return {"ok": True}


@router.delete("/knowledge/{topic}/core/{filename}")
async def delete_core_knowledge(topic: str, filename: str):
    """Delete a core knowledge file."""
    if topic not in TOPIC_MAP:
        raise HTTPException(400, f"Unknown topic: {topic}")
    from backend.config import settings
    topic_dir = settings.knowledge_path / TOPIC_MAP[topic]
    filepath = topic_dir / filename
    if not filepath.exists():
        raise HTTPException(404, f"File not found: {filename}")
    filepath.unlink()
    from backend.indexer import _index_cache
    _index_cache.pop(topic, None)
    return {"ok": True}


@router.post("/knowledge/{topic}/core")
async def create_core_knowledge(topic: str, body: dict):
    """Create a new core knowledge file."""
    if topic not in TOPIC_MAP:
        raise HTTPException(400, f"Unknown topic: {topic}")
    filename = body.get("filename", "").strip()
    if not filename or not filename.endswith(".md"):
        raise HTTPException(400, "Filename must end with .md")
    from backend.config import settings
    topic_dir = settings.knowledge_path / TOPIC_MAP[topic]
    topic_dir.mkdir(parents=True, exist_ok=True)
    filepath = topic_dir / filename
    if filepath.exists():
        raise HTTPException(409, f"File already exists: {filename}")
    filepath.write_text(body.get("content", ""), encoding="utf-8")
    from backend.indexer import _index_cache
    _index_cache.pop(topic, None)
    return {"ok": True, "filename": filename}


@router.get("/knowledge/{topic}/high_freq")
async def get_high_freq(topic: str):
    """Get high-frequency question bank for a topic."""
    if topic not in TOPIC_MAP:
        raise HTTPException(400, f"Unknown topic: {topic}")
    from backend.config import settings
    filepath = settings.high_freq_path / f"{topic}.md"
    if not filepath.exists():
        return {"content": ""}
    return {"content": filepath.read_text(encoding="utf-8")}


@router.put("/knowledge/{topic}/high_freq")
async def update_high_freq(topic: str, body: dict):
    """Update high-frequency question bank for a topic."""
    if topic not in TOPIC_MAP:
        raise HTTPException(400, f"Unknown topic: {topic}")
    from backend.config import settings
    settings.high_freq_path.mkdir(parents=True, exist_ok=True)
    filepath = settings.high_freq_path / f"{topic}.md"
    filepath.write_text(body.get("content", ""), encoding="utf-8")
    return {"ok": True}


@router.get("/graph/{topic}")
def get_topic_graph(topic: str):
    """Build question relationship graph for a topic."""
    return build_graph(topic)


@router.get("/interview/review/{session_id}")
async def get_review(session_id: str):
    """Get review for a completed session."""
    session = get_session(session_id)
    if not session:
        raise HTTPException(404, "Session not found.")
    if not session.get("review"):
        raise HTTPException(400, "Interview not yet reviewed.")
    return session


@router.get("/interview/history")
async def get_history(
    limit: int = 20,
    offset: int = 0,
    mode: str = None,
    topic: str = None,
):
    """List past interview sessions with filtering and pagination."""
    return list_sessions(limit=limit, offset=offset, mode=mode, topic=topic)


@router.delete("/interview/session/{session_id}")
async def delete_session_endpoint(session_id: str):
    """Delete a session record."""
    deleted = delete_session(session_id)
    if not deleted:
        raise HTTPException(404, "Session not found.")
    return {"ok": True}


@router.get("/interview/topics")
async def get_interview_topics():
    """List distinct topics from completed sessions (for filter dropdown)."""
    return list_distinct_topics()


app.include_router(router)
