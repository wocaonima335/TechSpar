"""Spaced repetition helpers based on SM-2."""

from __future__ import annotations

from datetime import date, timedelta

from backend.memory import _load_profile, _save_profile


def sm2_update(sr_state: dict, score_0_10: float) -> dict:
    """Update one spaced-repetition state with an answer score."""
    quality = min(5, int(score_0_10 / 2))
    ease_factor = sr_state.get("ease_factor", 2.5)
    repetitions = sr_state.get("repetitions", 0)

    if quality >= 3:
        if repetitions == 0:
            interval = 1
        elif repetitions == 1:
            interval = 3
        else:
            interval = int(sr_state.get("interval_days", 1) * ease_factor)
        repetitions += 1
    else:
        interval = 1
        repetitions = 0

    ease_factor = max(1.3, ease_factor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)))

    return {
        "interval_days": interval,
        "ease_factor": round(ease_factor, 2),
        "repetitions": repetitions,
        "next_review": (date.today() + timedelta(days=interval)).isoformat(),
        "last_score": score_0_10,
    }


def get_due_reviews(user_id: str, topic: str | None = None) -> list[dict]:
    """Return weak points that are due for review for one user."""
    profile = _load_profile(user_id)
    today = date.today().isoformat()
    due = []

    for weak_point in profile.get("weak_points", []):
        if weak_point.get("improved"):
            continue
        if topic and weak_point.get("topic") != topic:
            continue
        next_review = weak_point.get("sr", {}).get("next_review", "2000-01-01")
        if next_review <= today:
            due.append(weak_point)

    due.sort(key=lambda item: item.get("sr", {}).get("ease_factor", 2.5))
    return due


def update_weak_point_sr(user_id: str, topic: str, point_text: str, score: float):
    """Update the review state for one weak point belonging to one user."""
    profile = _load_profile(user_id)

    for weak_point in profile.get("weak_points", []):
        if weak_point.get("improved"):
            continue
        if topic and weak_point.get("topic") != topic:
            continue
        weak_text = weak_point.get("point", "")
        if point_text.lower() in weak_text.lower() or weak_text.lower() in point_text.lower():
            weak_point["sr"] = sm2_update(weak_point.get("sr", {}), score)
            _save_profile(user_id, profile)
            return True

    return False


def init_sr_for_existing_points(user_id: str):
    """Ensure all active weak points have a spaced-repetition state."""
    profile = _load_profile(user_id)
    changed = False

    for weak_point in profile.get("weak_points", []):
        if weak_point.get("improved"):
            continue
        if "sr" not in weak_point:
            weak_point["sr"] = {
                "interval_days": 1,
                "ease_factor": 2.5,
                "repetitions": 0,
                "next_review": date.today().isoformat(),
                "last_score": None,
            }
            changed = True

    if changed:
        _save_profile(user_id, profile)
