"""Vector memory helpers backed by SQLite and numpy similarity search."""

from __future__ import annotations

import json
import logging
import sqlite3
from datetime import datetime

import numpy as np

from backend.config import settings
from backend.llm_provider import get_embedding

logger = logging.getLogger("uvicorn")

DB_PATH = settings.db_path
EMBEDDING_DIM = 1024
SIMILARITY_THRESHOLD = 0.75
TIME_DECAY_HALF_LIFE = 14.0
TIME_DECAY_WEIGHT = 0.3


def _get_conn() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def init_memory_table():
    """Create or migrate the memory_vectors table."""
    conn = _get_conn()
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS memory_vectors (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     TEXT,
            chunk_type  TEXT NOT NULL,
            content     TEXT NOT NULL,
            topic       TEXT,
            session_id  TEXT,
            metadata    TEXT DEFAULT '{}',
            embedding   BLOB NOT NULL,
            created_at  TEXT DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    try:
        conn.execute("SELECT user_id FROM memory_vectors LIMIT 1")
    except sqlite3.OperationalError:
        conn.execute("ALTER TABLE memory_vectors ADD COLUMN user_id TEXT")
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_mv_user_type ON memory_vectors(user_id, chunk_type)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_mv_user_topic ON memory_vectors(user_id, topic)"
    )
    conn.commit()
    conn.close()
    logger.info("memory_vectors table ready.")


def _embed(text: str) -> np.ndarray:
    embed_model = get_embedding()
    vec = embed_model.get_text_embedding(text)
    return np.array(vec, dtype=np.float32)


def _serialize(vec: np.ndarray) -> bytes:
    return vec.astype(np.float32).tobytes()


def _deserialize(blob: bytes) -> np.ndarray:
    return np.frombuffer(blob, dtype=np.float32)


def _cosine_similarity(query_vec: np.ndarray, matrix: np.ndarray) -> np.ndarray:
    query_norm = np.linalg.norm(query_vec)
    if query_norm < 1e-10:
        return np.zeros(matrix.shape[0])
    row_norms = np.linalg.norm(matrix, axis=1)
    row_norms = np.clip(row_norms, 1e-10, None)
    return (matrix @ query_vec) / (row_norms * query_norm)


def _time_decay(created_at: str) -> float:
    try:
        age = (datetime.now() - datetime.fromisoformat(created_at)).total_seconds() / 86400
    except (ValueError, TypeError):
        return 1.0
    decay = 0.5 ** (max(age, 0) / TIME_DECAY_HALF_LIFE)
    return TIME_DECAY_WEIGHT * decay + (1 - TIME_DECAY_WEIGHT)


def index_session_memory(
    user_id: str,
    session_id: str | None,
    topic: str | None,
    summary: str,
    weak_points: list[dict],
    strong_points: list[dict] | None = None,
    insight_text: str = "",
):
    """Embed and store memory chunks for a completed session."""
    conn = _get_conn()
    chunks = []

    if summary:
        chunks.append(("session_summary", summary, topic, session_id, "{}"))

    for wp in weak_points:
        point = wp.get("point", wp) if isinstance(wp, dict) else str(wp)
        if point:
            meta = json.dumps({"topic": wp.get("topic", topic) if isinstance(wp, dict) else topic})
            chunks.append(
                (
                    "weak_point",
                    point,
                    wp.get("topic", topic) if isinstance(wp, dict) else topic,
                    session_id,
                    meta,
                )
            )

    if insight_text:
        chunks.append(("insight", insight_text[:2000], topic, session_id, "{}"))

    if not chunks:
        conn.close()
        return

    embed_model = get_embedding()
    texts = [chunk[1] for chunk in chunks]
    vectors = embed_model.get_text_embedding_batch(texts)

    now = datetime.now().isoformat()
    for (chunk_type, content, chunk_topic, sid, meta), vec in zip(chunks, vectors):
        blob = _serialize(np.array(vec, dtype=np.float32))
        conn.execute(
            """
            INSERT INTO memory_vectors (
                user_id, chunk_type, content, topic, session_id, metadata, embedding, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (user_id, chunk_type, content, chunk_topic, sid, meta, blob, now),
        )

    conn.commit()
    conn.close()
    logger.info("Indexed %s memory chunks for user %s.", len(chunks), user_id)


def search_memory(
    user_id: str,
    query: str,
    chunk_types: list[str] | None = None,
    topic: str | None = None,
    top_k: int = 5,
) -> list[dict]:
    """Semantic search with time decay for one user."""
    conn = _get_conn()
    where = ["user_id = ?"]
    params = [user_id]
    if chunk_types:
        placeholders = ",".join("?" for _ in chunk_types)
        where.append(f"chunk_type IN ({placeholders})")
        params.extend(chunk_types)
    if topic:
        where.append("topic = ?")
        params.append(topic)

    rows = conn.execute(
        f"""
        SELECT id, user_id, chunk_type, content, topic, session_id, embedding, created_at
        FROM memory_vectors
        WHERE {' AND '.join(where)}
        """,
        params,
    ).fetchall()
    conn.close()

    if not rows:
        return []

    query_vec = _embed(query)
    embeddings = np.stack([_deserialize(row["embedding"]) for row in rows])
    similarities = _cosine_similarity(query_vec, embeddings)

    results = []
    for index, row in enumerate(rows):
        decay = _time_decay(row["created_at"])
        score = float(similarities[index]) * decay
        results.append(
            {
                "user_id": row["user_id"],
                "content": row["content"],
                "chunk_type": row["chunk_type"],
                "topic": row["topic"],
                "session_id": row["session_id"],
                "score": score,
                "created_at": row["created_at"],
            }
        )

    results.sort(key=lambda item: item["score"], reverse=True)
    return results[:top_k]


def find_similar_weak_point(
    user_id: str,
    new_point: str,
    existing_points: list[dict],
    threshold: float = SIMILARITY_THRESHOLD,
) -> int | None:
    """Find the nearest existing weak point for one user."""
    if not existing_points:
        return None

    conn = _get_conn()
    rows = conn.execute(
        """
        SELECT content, embedding
        FROM memory_vectors
        WHERE user_id = ? AND chunk_type = 'weak_point'
        """,
        (user_id,),
    ).fetchall()
    conn.close()

    cached = {row["content"]: _deserialize(row["embedding"]) for row in rows}
    new_vec = _embed(new_point)

    best_idx = None
    best_score = -1.0
    points_to_embed = []
    points_indices = []

    for index, weak_point in enumerate(existing_points):
        point_text = weak_point.get("point", "") if isinstance(weak_point, dict) else str(weak_point)
        if not point_text:
            continue
        if point_text in cached:
            sim = float(_cosine_similarity(new_vec, cached[point_text].reshape(1, -1))[0])
            if sim > best_score:
                best_score = sim
                best_idx = index
        else:
            points_to_embed.append(point_text)
            points_indices.append(index)

    if points_to_embed:
        embed_model = get_embedding()
        vectors = embed_model.get_text_embedding_batch(points_to_embed)
        for text, vec, index in zip(points_to_embed, vectors, points_indices):
            vec_np = np.array(vec, dtype=np.float32)
            sim = float(_cosine_similarity(new_vec, vec_np.reshape(1, -1))[0])
            if sim > best_score:
                best_score = sim
                best_idx = index

    if best_score >= threshold:
        return best_idx
    return None


def rebuild_index_from_profile(user_id: str):
    """Rebuild weak-point vectors from one user's profile."""
    from backend.memory import _load_profile

    conn = _get_conn()
    conn.execute(
        "DELETE FROM memory_vectors WHERE user_id = ? AND chunk_type = 'weak_point'",
        (user_id,),
    )
    conn.commit()

    profile = _load_profile(user_id)
    weak_points = profile.get("weak_points", [])

    if not weak_points:
        conn.close()
        return

    texts = [weak_point["point"] for weak_point in weak_points if weak_point.get("point")]
    if not texts:
        conn.close()
        return

    embed_model = get_embedding()
    vectors = embed_model.get_text_embedding_batch(texts)
    now = datetime.now().isoformat()

    for text, vec, weak_point in zip(texts, vectors, weak_points):
        blob = _serialize(np.array(vec, dtype=np.float32))
        meta = json.dumps(
            {
                "topic": weak_point.get("topic", ""),
                "times_seen": weak_point.get("times_seen", 1),
            }
        )
        conn.execute(
            """
            INSERT INTO memory_vectors (
                user_id, chunk_type, content, topic, metadata, embedding, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (user_id, "weak_point", text, weak_point.get("topic"), meta, blob, weak_point.get("first_seen", now)),
        )

    conn.commit()
    conn.close()
    logger.info("Rebuilt %s weak_point vectors for user %s.", len(texts), user_id)
