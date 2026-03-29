"""Question relationship graph built from completed drill sessions."""

from __future__ import annotations

import hashlib
import json
import sqlite3
from datetime import datetime

import numpy as np

from backend.config import settings
from backend.vector_memory import _cosine_similarity, _deserialize, _serialize

DB_PATH = settings.db_path
SIMILARITY_THRESHOLD = 0.65


def _get_conn() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def _init_question_embeddings_table(conn: sqlite3.Connection):
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS question_embeddings (
            question_hash TEXT PRIMARY KEY,
            topic         TEXT,
            question_text TEXT,
            embedding     BLOB NOT NULL,
            created_at    TEXT DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    conn.commit()


def _hash_question(text: str) -> str:
    return hashlib.md5(text.encode("utf-8")).hexdigest()


def _extract_questions(conn: sqlite3.Connection, user_id: str, topic: str) -> list[dict]:
    """Extract answered and scored drill questions for one user and topic."""
    rows = conn.execute(
        """
        SELECT session_id, questions, scores, created_at
        FROM sessions
        WHERE user_id = ? AND topic = ? AND mode = 'topic_drill' AND review IS NOT NULL
        ORDER BY created_at ASC
        """,
        (user_id, topic),
    ).fetchall()

    seen: dict[str, dict] = {}
    for row in rows:
        questions = json.loads(row["questions"] or "[]")
        scores = json.loads(row["scores"] or "[]")
        score_map = {score["question_id"]: score for score in scores if "question_id" in score}

        for question in questions:
            text = question.get("question", "").strip()
            if not text:
                continue
            question_id = question.get("id")
            score = score_map.get(question_id, {})
            score_value = score.get("score")
            if not isinstance(score_value, (int, float)):
                continue

            seen[text] = {
                "question": text,
                "score": score_value,
                "focus_area": question.get("focus_area", ""),
                "difficulty": question.get("difficulty", 3),
                "date": row["created_at"][:10] if row["created_at"] else "",
                "session_id": row["session_id"],
            }

    return list(seen.values())


def _get_or_compute_embeddings(
    conn: sqlite3.Connection,
    questions: list[dict],
    topic: str,
) -> np.ndarray:
    """Load cached embeddings or compute missing ones."""
    from backend.llm_provider import get_embedding

    _init_question_embeddings_table(conn)
    hashes = [_hash_question(question["question"]) for question in questions]

    cached: dict[str, np.ndarray] = {}
    if hashes:
        placeholders = ",".join("?" for _ in hashes)
        rows = conn.execute(
            f"SELECT question_hash, embedding FROM question_embeddings WHERE question_hash IN ({placeholders})",
            hashes,
        ).fetchall()
        for row in rows:
            cached[row["question_hash"]] = _deserialize(row["embedding"])

    missing_texts = []
    missing_indexes = []
    for index, (question_hash, question) in enumerate(zip(hashes, questions)):
        if question_hash not in cached:
            missing_texts.append(question["question"])
            missing_indexes.append(index)

    if missing_texts:
        embed_model = get_embedding()
        vectors = embed_model.get_text_embedding_batch(missing_texts)
        now = datetime.now().isoformat()
        for text, vec, index in zip(missing_texts, vectors, missing_indexes):
            vec_np = np.array(vec, dtype=np.float32)
            question_hash = hashes[index]
            cached[question_hash] = vec_np
            conn.execute(
                """
                INSERT OR REPLACE INTO question_embeddings (
                    question_hash, topic, question_text, embedding, created_at
                ) VALUES (?, ?, ?, ?, ?)
                """,
                (question_hash, topic, text, _serialize(vec_np), now),
            )
        conn.commit()

    return np.stack([cached[question_hash] for question_hash in hashes])


def build_graph(user_id: str, topic: str) -> dict:
    """Build a question relationship graph for one user's topic history."""
    conn = _get_conn()
    questions = _extract_questions(conn, user_id, topic)

    if len(questions) < 2:
        conn.close()
        return {
            "nodes": [{"id": index, **question} for index, question in enumerate(questions)],
            "links": [],
        }

    embeddings = _get_or_compute_embeddings(conn, questions, topic)
    conn.close()

    nodes = []
    for index, question in enumerate(questions):
        nodes.append(
            {
                "id": index,
                "question": question["question"],
                "score": question["score"],
                "focus_area": question["focus_area"],
                "difficulty": question["difficulty"],
                "date": question["date"],
            }
        )

    links = []
    question_count = len(questions)
    for left in range(question_count):
        for right in range(left + 1, question_count):
            similarity = float(_cosine_similarity(embeddings[left], embeddings[right].reshape(1, -1))[0])
            if similarity >= SIMILARITY_THRESHOLD:
                links.append(
                    {
                        "source": left,
                        "target": right,
                        "similarity": round(similarity, 3),
                    }
                )

    return {"nodes": nodes, "links": links}
