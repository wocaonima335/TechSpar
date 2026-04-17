"""FastAPI entrypoint for TechSpar."""

from __future__ import annotations

import shutil
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, FastAPI, File, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from backend.bootstrap import run_bootstrap
from backend.config import settings
from backend.graph import build_graph
from backend.graphs.resume_interview import compile_resume_interview
from backend.graphs.review import generate_review
from backend.graphs.topic_drill import TOPIC_DISPLAY, evaluate_drill_answers, generate_drill_questions
from backend.indexer import TOPIC_MAP, _index_cache, load_topics, save_topics
from backend.memory import (
    _load_profile,
    _save_profile,
    get_profile,
    llm_update_profile,
    update_profile_after_interview,
)
from backend.models import (
    AdminChangePasswordRequest,
    AdminSelfUpdateRequest,
    AdminUserCreateRequest,
    AdminUserUpdateRequest,
    AuthUser,
    ChatRequest,
    EndDrillRequest,
    InterviewMode,
    InterviewPhase,
    LoginRequest,
    ResetPasswordRequest,
    RuntimeSettingsUpdateRequest,
    StartInterviewRequest,
)
from backend.runtime_settings import (
    delete_runtime_settings,
    get_persisted_runtime_settings,
    get_runtime_settings_admin_view,
    upsert_runtime_settings,
)
from backend.security import create_access_token, get_current_user, hash_password, require_admin, verify_password
from backend.storage.sessions import (
    append_message,
    create_session,
    delete_session,
    get_session,
    list_distinct_topics,
    list_sessions,
    list_sessions_by_topic,
    save_drill_answers,
    save_review,
)
from backend.storage.users import (
    create_user,
    get_user_by_id,
    get_user_by_username,
    list_users,
    reset_user_password,
    update_last_login,
    update_user,
)

app = FastAPI(title="TechSpar", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
router = APIRouter(prefix="/api")

_graphs: dict[str, dict] = {}
_drill_sessions: dict[str, dict] = {}


def _serialize_user(user: AuthUser) -> dict:
    return user.model_dump()


def _ensure_session_owner(owner_user_id: str, current_user: AuthUser):
    if owner_user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Session owner mismatch")


def _refresh_runtime_clients(changed_keys: set[str]):
    from backend.indexer import _init_llama_settings
    from backend.llm_provider import get_embedding, reset_runtime_clients

    reset_runtime_clients(changed_keys)
    if not changed_keys or changed_keys & {"embedding_api_base", "embedding_api_key", "embedding_model"}:
        get_embedding()
    _init_llama_settings()


@app.on_event("startup")
def preload_models():
    """Run migrations first, then warm up embedding and Llama settings."""
    from backend.indexer import _init_llama_settings
    from backend.llm_provider import get_embedding

    run_bootstrap()
    get_embedding()
    _init_llama_settings()


@router.get("/")
def root():
    return {"service": "TechSpar", "version": "0.1.0"}


@router.post("/auth/login")
def login(body: LoginRequest):
    row = get_user_by_username(body.username)
    if not row:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")
    user = AuthUser(
        id=row["id"],
        username=row["username"],
        display_name=row["display_name"],
        role=row["role"],
        status=row["status"],
    )
    if user.status.value != "active":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User is disabled")
    if not verify_password(body.password, row["password_hash"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")

    update_last_login(user.id)
    token = create_access_token(user)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": _serialize_user(user),
    }


@router.get("/auth/me")
def auth_me(current_user: AuthUser = Depends(get_current_user)):
    return _serialize_user(current_user)


@router.get("/resume/status")
def resume_status(current_user: AuthUser = Depends(get_current_user)):
    resume_file = settings.get_resume_file(current_user.id)
    if not resume_file.exists():
        return {"has_resume": False}
    return {"has_resume": True, "filename": resume_file.name, "size": resume_file.stat().st_size}


@router.post("/resume/upload")
async def upload_resume(file: UploadFile = File(...), current_user: AuthUser = Depends(get_current_user)):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only PDF files are supported.")

    resume_dir = settings.get_resume_dir(current_user.id)
    resume_dir.mkdir(parents=True, exist_ok=True)

    for old_file in resume_dir.iterdir():
        if old_file.is_file():
            old_file.unlink()

    destination = settings.get_resume_file(current_user.id)
    content = await file.read()
    destination.write_bytes(content)

    _index_cache.pop(f"resume:{current_user.id}", None)
    cache_dir = settings.get_resume_cache_dir(current_user.id)
    if cache_dir.exists():
        shutil.rmtree(cache_dir)

    return {"ok": True, "filename": destination.name, "size": len(content)}


@router.post("/transcribe")
async def transcribe(file: UploadFile = File(...), current_user: AuthUser = Depends(get_current_user)):
    audio_bytes = await file.read()
    if not audio_bytes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty audio file.")

    try:
        from backend.transcribe import transcribe_audio

        suffix = "." + (file.filename or "audio.webm").rsplit(".", 1)[-1]
        text = transcribe_audio(audio_bytes, suffix=suffix)
        return {"text": text}
    except ImportError as exc:
        raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="FunASR not installed.") from exc
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Transcription failed: {exc}") from exc


@router.get("/topics")
def get_topics(current_user: AuthUser = Depends(get_current_user)):
    return load_topics()


@router.get("/profile")
def get_user_profile(current_user: AuthUser = Depends(get_current_user)):
    return get_profile(current_user.id)


@router.get("/profile/due-reviews")
def profile_due_reviews(topic: str | None = None, current_user: AuthUser = Depends(get_current_user)):
    from backend.spaced_repetition import get_due_reviews as get_due_reviews_fn

    return get_due_reviews_fn(current_user.id, topic)


@router.get("/profile/topic/{topic}/history")
def get_topic_history(topic: str, current_user: AuthUser = Depends(get_current_user)):
    return list_sessions_by_topic(current_user.id, topic)


@router.post("/profile/topic/{topic}/retrospective")
async def generate_retrospective(topic: str, current_user: AuthUser = Depends(get_current_user)):
    from backend.prompts.interviewer import TOPIC_RETROSPECTIVE_PROMPT

    sessions = list_sessions_by_topic(current_user.id, topic)
    if not sessions:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No history for this topic yet.")

    profile = _load_profile(current_user.id)
    topic_name = TOPIC_DISPLAY.get(topic, topic)
    mastery = profile.get("topic_mastery", {}).get(topic, {})

    history_lines = []
    for session in sessions:
        date = session["created_at"][:10]
        scores = session.get("scores", [])
        valid_scores = [score for score in scores if isinstance(score.get("score"), (int, float))]
        avg = round(sum(score["score"] for score in valid_scores) / len(valid_scores), 1) if valid_scores else None

        review = session.get("review") or ""
        summary_part = review.split("## 逐题复盘")[0].strip()
        score_lines = []
        for score in valid_scores:
            line = f"- Q{score.get('question_id', '?')}: {score['score']}/10"
            if score.get("assessment"):
                line += f" - {score['assessment']}"
            score_lines.append(line)

        history_lines.append(
            f"### {date} (答题 {len(valid_scores)}/10, 平均 {avg or '-'} /10)\n"
            f"{summary_part}\n"
            + ("\n".join(score_lines) + "\n" if score_lines else "")
        )

    mastery_score = mastery.get("score", mastery.get("level", 0) * 20)
    mastery_text = f"{mastery_score}/100 - {mastery.get('notes', '')}" if mastery_score > 0 else "暂无评估"

    prompt = TOPIC_RETROSPECTIVE_PROMPT.format(
        topic_name=topic_name,
        session_history="\n".join(history_lines),
        mastery_info=mastery_text,
    )

    from backend.llm_provider import get_langchain_llm

    llm = get_langchain_llm()
    response = llm.invoke(
        [
            SystemMessage(content="你是面试教练，用 markdown 生成主题回顾报告。"),
            HumanMessage(content=prompt),
        ]
    )

    retrospective = response.content.strip()
    profile.setdefault("topic_mastery", {}).setdefault(topic, {})["retrospective"] = retrospective
    profile["topic_mastery"][topic]["retrospective_at"] = datetime.now().isoformat()
    _save_profile(current_user.id, profile)

    return {
        "topic": topic,
        "topic_name": topic_name,
        "retrospective": retrospective,
        "session_count": len(sessions),
    }


@router.post("/interview/start")
async def start_interview(req: StartInterviewRequest, current_user: AuthUser = Depends(get_current_user)):
    session_id = str(uuid.uuid4())[:8]

    if req.mode == InterviewMode.TOPIC_DRILL:
        if not req.topic or req.topic not in TOPIC_MAP:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid topic: {req.topic}")

        try:
            questions = generate_drill_questions(current_user.id, req.topic)
        except RuntimeError as exc:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc

        create_session(current_user.id, session_id, req.mode.value, req.topic, questions=questions)
        _drill_sessions[session_id] = {
            "owner_user_id": current_user.id,
            "topic": req.topic,
            "questions": questions,
        }
        return {
            "session_id": session_id,
            "mode": req.mode.value,
            "topic": req.topic,
            "questions": questions,
        }

    graph = compile_resume_interview(current_user.id)
    config = {"configurable": {"thread_id": session_id}}
    result = graph.invoke({}, config)

    ai_message = ""
    for message in reversed(result["messages"]):
        if isinstance(message, AIMessage):
            ai_message = message.content
            break

    create_session(current_user.id, session_id, req.mode.value, req.topic)
    append_message(current_user.id, session_id, "assistant", ai_message)
    _graphs[session_id] = {
        "owner_user_id": current_user.id,
        "graph": graph,
        "config": config,
        "mode": req.mode,
        "topic": req.topic,
    }
    return {
        "session_id": session_id,
        "mode": req.mode.value,
        "topic": req.topic,
        "message": ai_message,
    }


@router.post("/interview/chat")
async def chat(req: ChatRequest, current_user: AuthUser = Depends(get_current_user)):
    if req.session_id not in _graphs:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found.")

    entry = _graphs[req.session_id]
    _ensure_session_owner(entry["owner_user_id"], current_user)

    graph = entry["graph"]
    config = entry["config"]
    result = graph.invoke({"messages": [HumanMessage(content=req.message)]}, config)

    append_message(current_user.id, req.session_id, "user", req.message)

    is_finished = False
    if isinstance(result, dict):
        is_finished = result.get("is_finished", False)
        phase = result.get("phase", "")
        if phase in (InterviewPhase.END.value, "end"):
            is_finished = True

    ai_message = ""
    for message in reversed(result["messages"]):
        if isinstance(message, AIMessage):
            ai_message = message.content
            break

    append_message(current_user.id, req.session_id, "assistant", ai_message)
    return {
        "session_id": req.session_id,
        "message": ai_message,
        "is_finished": is_finished,
    }


@router.post("/interview/end/{session_id}")
async def end_interview(
    session_id: str,
    body: EndDrillRequest | None = None,
    current_user: AuthUser = Depends(get_current_user),
):
    if session_id in _drill_sessions:
        entry = _drill_sessions[session_id]
        _ensure_session_owner(entry["owner_user_id"], current_user)
        topic = entry["topic"]
        questions = entry["questions"]
        answers = body.answers if body and body.answers else []

        save_drill_answers(current_user.id, session_id, answers)
        eval_result = evaluate_drill_answers(topic, questions, answers)
        scores = eval_result.get("scores", [])
        overall = eval_result.get("overall", {})

        question_difficulty = {question["id"]: question.get("difficulty", 3) for question in questions}
        for score in scores:
            score.setdefault("difficulty", question_difficulty.get(score.get("question_id"), 3))

        review = _format_drill_review(questions, answers, scores, overall)
        save_review(current_user.id, session_id, review, scores, overall.get("new_weak_points", []), overall)

        from backend.spaced_repetition import update_weak_point_sr

        for score in scores:
            weak_point = score.get("weak_point")
            score_value = score.get("score")
            if weak_point and isinstance(score_value, (int, float)):
                update_weak_point_sr(current_user.id, topic, weak_point, score_value)

        await _update_drill_profile(current_user.id, topic, overall, scores, len(questions))
        del _drill_sessions[session_id]
        return {
            "session_id": session_id,
            "mode": "topic_drill",
            "review": review,
            "scores": scores,
            "overall": overall,
        }

    if session_id not in _graphs:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found.")

    entry = _graphs[session_id]
    _ensure_session_owner(entry["owner_user_id"], current_user)

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
        user_id=current_user.id,
        mode=entry["mode"].value,
        topic=entry.get("topic"),
        messages=messages,
        scores=scores,
    )

    resume_overall = {}
    if extraction.get("dimension_scores"):
        resume_overall["dimension_scores"] = extraction["dimension_scores"]
    if extraction.get("avg_score") is not None:
        resume_overall["avg_score"] = extraction["avg_score"]

    save_review(current_user.id, session_id, review, scores, weak_points, overall=resume_overall)
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


def _format_drill_review(questions: list[dict], answers: list[dict], scores: list[dict], overall: dict) -> str:
    answer_map = {answer["question_id"]: answer["answer"] for answer in answers}
    score_map = {score["question_id"]: score for score in scores}

    lines = [f"## 整体评价\n\n{overall.get('summary', '')}\n\n**平均分: {overall.get('avg_score', '-')}/10**\n"]
    lines.append("---\n\n## 逐题复盘\n")
    for question in questions:
        question_id = question["id"]
        score = score_map.get(question_id, {})
        answer = answer_map.get(question_id, "")

        if not answer:
            lines.append(f"### Q{question_id} ({question.get('focus_area', '')}) - 未作答")
            lines.append(f"**题目**: {question['question']}\n")
            continue

        score_value = score.get("score", "-")
        assessment = score.get("assessment", "")
        understanding = score.get("understanding", "")
        missing = score.get("key_missing", [])

        lines.append(f"### Q{question_id} ({question.get('focus_area', '')}) - {score_value}/10")
        lines.append(f"**题目**: {question['question']}")
        lines.append(f"**你的回答**: {answer}")
        if assessment:
            lines.append(f"**点评**: {assessment}")
        improvement = score.get("improvement", "")
        if improvement:
            lines.append(f"**改进建议**: {improvement}")
        if understanding:
            lines.append(f"**理解程度**: {understanding}")
        if missing:
            lines.append(f"**遗漏关键点**: {', '.join(missing)}")
        lines.append("")

    if overall.get("new_weak_points"):
        lines.append("---\n\n## 薄弱点")
        for weak_point in overall["new_weak_points"]:
            lines.append(f"- {weak_point.get('point', weak_point) if isinstance(weak_point, dict) else weak_point}")

    if overall.get("new_strong_points"):
        lines.append("\n## 亮点")
        for strong_point in overall["new_strong_points"]:
            lines.append(f"- {strong_point.get('point', strong_point) if isinstance(strong_point, dict) else strong_point}")

    return "\n".join(lines)


async def _update_drill_profile(user_id: str, topic: str, overall: dict, scores: list, total_questions: int = 10):
    valid = []
    for score in scores:
        try:
            valid.append((float(score["score"]), float(score.get("difficulty", 3))))
        except (TypeError, ValueError, KeyError):
            pass

    mastery = overall.get("topic_mastery", {})
    if isinstance(mastery, str):
        mastery = {"notes": mastery}
    elif not isinstance(mastery, dict):
        mastery = {}
    else:
        mastery = dict(mastery)

    coverage = len(valid) / total_questions if total_questions else 0
    session_weight = coverage * 0.4

    if valid:
        contributions = [(difficulty / 5) * (score / 10) for score, difficulty in valid]
        mastery["score"] = round(sum(contributions) / total_questions * 100, 1)
    mastery.pop("level", None)

    await llm_update_profile(
        user_id=user_id,
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


@router.get("/knowledge/{topic}/core")
async def get_core_knowledge(topic: str, current_user: AuthUser = Depends(get_current_user)):
    if topic not in TOPIC_MAP:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unknown topic: {topic}")
    topic_dir = settings.knowledge_path / TOPIC_MAP[topic]
    if not topic_dir.exists():
        return []
    files = []
    for file in sorted(topic_dir.glob("*.md")):
        files.append({"filename": file.name, "content": file.read_text(encoding="utf-8")})
    return files


@router.get("/knowledge/{topic}/high_freq")
async def get_high_freq(topic: str, current_user: AuthUser = Depends(get_current_user)):
    if topic not in TOPIC_MAP:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unknown topic: {topic}")
    filepath = settings.high_freq_path / f"{topic}.md"
    if not filepath.exists():
        return {"content": ""}
    return {"content": filepath.read_text(encoding="utf-8")}


@router.get("/graph/{topic}")
def get_topic_graph(topic: str, current_user: AuthUser = Depends(get_current_user)):
    return build_graph(current_user.id, topic)


@router.get("/interview/review/{session_id}")
async def get_review_endpoint(session_id: str, current_user: AuthUser = Depends(get_current_user)):
    session = get_session(current_user.id, session_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found.")
    if not session.get("review"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Interview not yet reviewed.")
    return session


@router.get("/interview/history")
async def get_history(
    limit: int = 20,
    offset: int = 0,
    mode: str | None = None,
    topic: str | None = None,
    current_user: AuthUser = Depends(get_current_user),
):
    return list_sessions(current_user.id, limit=limit, offset=offset, mode=mode, topic=topic)


@router.delete("/interview/session/{session_id}")
async def delete_session_endpoint(session_id: str, current_user: AuthUser = Depends(get_current_user)):
    deleted = delete_session(current_user.id, session_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found.")
    return {"ok": True}


@router.get("/interview/topics")
async def get_interview_topics(current_user: AuthUser = Depends(get_current_user)):
    return list_distinct_topics(current_user.id)


@router.get("/admin/settings")
def admin_get_settings(admin_user: AuthUser = Depends(require_admin)):
    return get_runtime_settings_admin_view()


@router.patch("/admin/settings")
def admin_update_settings(body: RuntimeSettingsUpdateRequest, admin_user: AuthUser = Depends(require_admin)):
    updates = body.model_dump(exclude_none=True)
    if not updates:
        return get_runtime_settings_admin_view()

    previous = get_persisted_runtime_settings()
    changed_keys = set(updates.keys())
    previous_runtime_values = {key: getattr(settings, key) for key in changed_keys}
    try:
        upsert_runtime_settings(updates)
        _refresh_runtime_clients(changed_keys)
    except Exception as exc:
        restore_values = {key: previous[key] for key in changed_keys if key in previous}
        delete_keys = changed_keys - set(previous)
        if delete_keys:
            delete_runtime_settings(delete_keys)
        if restore_values:
            upsert_runtime_settings(restore_values)
        for key, value in previous_runtime_values.items():
            setattr(settings, key, value)
        _refresh_runtime_clients(changed_keys)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Failed to apply runtime settings: {exc}") from exc
    return get_runtime_settings_admin_view()


@router.patch("/admin/me")
def admin_update_me(body: AdminSelfUpdateRequest, admin_user: AuthUser = Depends(require_admin)):
    updates = body.model_dump(exclude_none=True)
    if not updates:
        return {"user": _serialize_user(admin_user), "reauth_required": False}

    try:
        user = update_user(
            admin_user.id,
            username=updates.get("username"),
            display_name=updates.get("display_name"),
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    reauth_required = user.username != admin_user.username
    return {
        "user": _serialize_user(user),
        "reauth_required": reauth_required,
    }


@router.post("/admin/me/change-password")
def admin_change_my_password(body: AdminChangePasswordRequest, admin_user: AuthUser = Depends(require_admin)):
    row = get_user_by_id(admin_user.id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if not verify_password(body.current_password, row["password_hash"]):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")
    if not reset_user_password(admin_user.id, hash_password(body.new_password)):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return {"ok": True, "reauth_required": True}


@router.get("/admin/users")
def admin_list_users(admin_user: AuthUser = Depends(require_admin)):
    return [_serialize_user(user) for user in list_users()]


@router.post("/admin/users")
def admin_create_user(body: AdminUserCreateRequest, admin_user: AuthUser = Depends(require_admin)):
    existing = get_user_by_username(body.username)
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already exists")
    user = create_user(
        username=body.username,
        display_name=body.display_name,
        password_hash=hash_password(body.password),
        role=body.role,
        status=body.status,
    )
    return _serialize_user(user)


@router.patch("/admin/users/{user_id}")
def admin_update_user(
    user_id: str,
    body: AdminUserUpdateRequest,
    admin_user: AuthUser = Depends(require_admin),
):
    try:
        user = update_user(
            user_id,
            username=body.username,
            display_name=body.display_name,
            role=body.role,
            status=body.status,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return _serialize_user(user)


@router.post("/admin/users/{user_id}/reset-password")
def admin_reset_password(
    user_id: str,
    body: ResetPasswordRequest,
    admin_user: AuthUser = Depends(require_admin),
):
    if not reset_user_password(user_id, hash_password(body.password)):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    row = get_user_by_id(user_id)
    return {"ok": True, "user": _serialize_user(AuthUser(**{
        "id": row["id"],
        "username": row["username"],
        "display_name": row["display_name"],
        "role": row["role"],
        "status": row["status"],
    }))} if row else {"ok": True}


@router.post("/admin/topics")
def admin_create_topic(body: dict, admin_user: AuthUser = Depends(require_admin)):
    key = body.get("key", "").strip()
    name = body.get("name", "").strip()
    icon = body.get("icon", "🔵").strip()
    if not key or not name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="key and name are required")

    topics = load_topics()
    if key in topics:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Topic '{key}' already exists")

    dir_name = body.get("dir", key).strip()
    topics[key] = {"name": name, "icon": icon, "dir": dir_name}
    save_topics(topics)

    topic_dir = settings.knowledge_path / dir_name
    topic_dir.mkdir(parents=True, exist_ok=True)
    readme = topic_dir / "README.md"
    if not readme.exists():
        readme.write_text(f"# {name}\n", encoding="utf-8")
    return {"ok": True, "key": key}


@router.delete("/admin/topics/{key}")
def admin_delete_topic(key: str, admin_user: AuthUser = Depends(require_admin)):
    topics = load_topics()
    if key not in topics:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Topic '{key}' not found")
    del topics[key]
    save_topics(topics)
    _index_cache.pop(key, None)
    return {"ok": True}


@router.post("/admin/knowledge/{topic}/core")
async def admin_create_core_knowledge(topic: str, body: dict, admin_user: AuthUser = Depends(require_admin)):
    if topic not in TOPIC_MAP:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unknown topic: {topic}")
    filename = body.get("filename", "").strip()
    if not filename or not filename.endswith(".md"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Filename must end with .md")

    topic_dir = settings.knowledge_path / TOPIC_MAP[topic]
    topic_dir.mkdir(parents=True, exist_ok=True)
    filepath = topic_dir / filename
    if filepath.exists():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"File already exists: {filename}")
    filepath.write_text(body.get("content", ""), encoding="utf-8")
    _index_cache.pop(topic, None)
    return {"ok": True, "filename": filename}


@router.put("/admin/knowledge/{topic}/core/{filename}")
async def admin_update_core_knowledge(
    topic: str,
    filename: str,
    body: dict,
    admin_user: AuthUser = Depends(require_admin),
):
    if topic not in TOPIC_MAP:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unknown topic: {topic}")
    topic_dir = settings.knowledge_path / TOPIC_MAP[topic]
    filepath = topic_dir / filename
    if not filepath.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"File not found: {filename}")
    filepath.write_text(body.get("content", ""), encoding="utf-8")
    _index_cache.pop(topic, None)
    return {"ok": True}


@router.delete("/admin/knowledge/{topic}/core/{filename}")
async def admin_delete_core_knowledge(
    topic: str,
    filename: str,
    admin_user: AuthUser = Depends(require_admin),
):
    if topic not in TOPIC_MAP:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unknown topic: {topic}")
    topic_dir = settings.knowledge_path / TOPIC_MAP[topic]
    filepath = topic_dir / filename
    if not filepath.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"File not found: {filename}")
    filepath.unlink()
    _index_cache.pop(topic, None)
    return {"ok": True}


@router.put("/admin/knowledge/{topic}/high_freq")
async def admin_update_high_freq(topic: str, body: dict, admin_user: AuthUser = Depends(require_admin)):
    if topic not in TOPIC_MAP:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unknown topic: {topic}")
    settings.high_freq_path.mkdir(parents=True, exist_ok=True)
    filepath = settings.high_freq_path / f"{topic}.md"
    filepath.write_text(body.get("content", ""), encoding="utf-8")
    return {"ok": True}


app.include_router(router)
