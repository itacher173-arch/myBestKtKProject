"""Подключение к Redis."""

from __future__ import annotations

import os
import time
from typing import Any

import redis

_client: redis.Redis | None = None


def redis_url() -> str:
    return (os.environ.get("REDIS_URL") or "redis://127.0.0.1:6379/0").strip()


def get_redis() -> redis.Redis:
    global _client
    if _client is None:
        _client = redis.Redis.from_url(
            redis_url(),
            decode_responses=True,
            socket_connect_timeout=2,
            socket_timeout=2,
        )
    return _client


def wait_for_redis(timeout_sec: float = 30.0) -> None:
    deadline = time.time() + timeout_sec
    last_error: Exception | None = None
    while time.time() < deadline:
        try:
            get_redis().ping()
            return
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            time.sleep(0.5)
    raise RuntimeError(f"Redis недоступен: {last_error}")


def redis_status() -> dict[str, Any]:
    try:
        get_redis().ping()
        return {"status": "ok", "url": _safe_label()}
    except Exception as exc:  # noqa: BLE001
        return {"status": "error", "error": str(exc)}


def _safe_label() -> str:
    url = redis_url()
    if "@" in url:
        # redis://:pass@host:6379/0 → redis://***@host:6379/0
        scheme, rest = url.split("://", 1)
        creds, hostpart = rest.rsplit("@", 1)
        return f"{scheme}://***@{hostpart}"
    return url
