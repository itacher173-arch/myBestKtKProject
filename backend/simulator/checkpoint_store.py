"""Durable checkpoints for unfinished simulator sessions."""

from __future__ import annotations

import json
import os
import time
from typing import Any

from backend.common.redis_client import get_redis

CHECKPOINT_PREFIX = "ktk:sim:checkpoint:"
ACTIVE_PREFIX = "ktk:sim:active:"
CHECKPOINT_TTL_SEC = int(
    os.environ.get("KTK_SIM_CHECKPOINT_TTL_SEC", str(72 * 60 * 60))
)


def _checkpoint_key(session_id: str) -> str:
    return f"{CHECKPOINT_PREFIX}{session_id}"


def _active_key(user_id: str) -> str:
    return f"{ACTIVE_PREFIX}{user_id}"


def save_session(
    session_data: dict[str, Any],
    *,
    client_state: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Upsert a server checkpoint while preserving the latest client overlay."""
    session_id = str(session_data["id"])
    user_id = str(session_data["userId"])
    r = get_redis()
    previous = get_by_id(session_id)
    checkpoint = {
        "sessionId": session_id,
        "userId": user_id,
        "status": "active",
        "savedAt": int(time.time() * 1000),
        "session": session_data,
        "clientState": (
            client_state
            if client_state is not None
            else (previous or {}).get("clientState")
        ),
    }
    payload = json.dumps(checkpoint, ensure_ascii=False, separators=(",", ":"))
    pipe = r.pipeline()
    pipe.set(_checkpoint_key(session_id), payload, ex=CHECKPOINT_TTL_SEC)
    pipe.set(_active_key(user_id), session_id, ex=CHECKPOINT_TTL_SEC)
    pipe.execute()
    return checkpoint


def get_by_id(session_id: str) -> dict[str, Any] | None:
    raw = get_redis().get(_checkpoint_key(session_id))
    if not raw:
        return None
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        get_redis().delete(_checkpoint_key(session_id))
        return None
    return data if isinstance(data, dict) else None


def get_active(user_id: str) -> dict[str, Any] | None:
    r = get_redis()
    session_id = r.get(_active_key(user_id))
    if not session_id:
        return None
    checkpoint = get_by_id(session_id)
    if not checkpoint or checkpoint.get("status") != "active":
        r.delete(_active_key(user_id))
        return None
    r.expire(_active_key(user_id), CHECKPOINT_TTL_SEC)
    r.expire(_checkpoint_key(session_id), CHECKPOINT_TTL_SEC)
    return checkpoint


def delete_session(session_id: str, user_id: str) -> None:
    """Delete checkpoint and clear the user index only if it points here."""
    r = get_redis()
    active_key = _active_key(user_id)
    pipe = r.pipeline()
    pipe.get(active_key)
    pipe.delete(_checkpoint_key(session_id))
    active_id, _ = pipe.execute()
    if active_id == session_id:
        r.delete(active_key)
