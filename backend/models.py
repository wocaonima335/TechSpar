"""Data models — LangGraph states (TypedDict) + API models (Pydantic)."""
from __future__ import annotations

from enum import Enum
from typing import Annotated, TypedDict
from pydantic import BaseModel, Field
from langgraph.graph import add_messages


# ── Enums ──

class InterviewMode(str, Enum):
    RESUME = "resume"
    TOPIC_DRILL = "topic_drill"


class InterviewPhase(str, Enum):
    GREETING = "greeting"
    SELF_INTRO = "self_intro"
    TECHNICAL = "technical"
    PROJECT_DEEP_DIVE = "project_deep_dive"
    REVERSE_QA = "reverse_qa"
    END = "end"


class UserRole(str, Enum):
    ADMIN = "admin"
    MEMBER = "member"


class UserStatus(str, Enum):
    ACTIVE = "active"
    DISABLED = "disabled"


# ── LangGraph States (TypedDict for max compatibility) ──

class ResumeInterviewState(TypedDict, total=False):
    messages: Annotated[list, add_messages]
    phase: str           # InterviewPhase value
    resume_context: str
    questions_asked: list[str]
    phase_question_count: int
    is_finished: bool
    last_eval: dict          # Latest inline eval from interviewer {score, should_advance, brief}
    eval_history: list       # All evals accumulated across the interview


class TopicDrillState(TypedDict, total=False):
    messages: Annotated[list, add_messages]
    topic: str
    topic_name: str
    knowledge_context: str
    difficulty: int
    questions_asked: list[str]
    scores: list[dict]
    weak_points: list[str]
    total_questions: int
    is_finished: bool


# ── API Models (Pydantic) ──

class StartInterviewRequest(BaseModel):
    mode: InterviewMode
    topic: str | None = None


class ChatRequest(BaseModel):
    session_id: str
    message: str


class EndDrillRequest(BaseModel):
    answers: list[dict] = Field(default_factory=list)  # [{question_id: int, answer: str}]


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=256)


class AuthUser(BaseModel):
    id: str
    username: str
    display_name: str
    role: UserRole
    status: UserStatus


class AdminUserCreateRequest(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    display_name: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=6, max_length=256)
    role: UserRole = UserRole.MEMBER
    status: UserStatus = UserStatus.ACTIVE


class AdminUserUpdateRequest(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=64)
    role: UserRole | None = None
    status: UserStatus | None = None


class ResetPasswordRequest(BaseModel):
    password: str = Field(min_length=6, max_length=256)
