"""Серверные сессии пользователей в Redis."""

from __future__ import annotations

import json
import secrets
import time
from typing import Any

from backend.common.redis_client import get_redis

SESSION_COOKIE = "ktk_session"
SESSION_TTL_SEC = 12 * 60 * 60  # 12 часов
SESSION_PREFIX = "ktk:session:"


def _key(token: str) -> str:
    return f"{SESSION_PREFIX}{token}"


def create_session(user: dict[str, Any]) -> str:
    token = secrets.token_urlsafe(32)
    payload = {
        "token": token,
        "user": {
            "id": user["id"],
            "login": user.get("login") or "",
            "fullName": user["fullName"],
            "role": user["role"],
            "createdAt": user.get("createdAt"),
        },
        "createdAt": int(time.time() * 1000),
    }
    r = get_redis()
    r.set(_key(token), json.dumps(payload, ensure_ascii=False), ex=SESSION_TTL_SEC)
    return token


def get_session(token: str | None) -> dict[str, Any] | None:
    if not token or not token.strip():
        return None
    r = get_redis()
    raw = r.get(_key(token.strip()))
    if not raw:
        return None
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        r.delete(_key(token.strip()))
        return None
    # sliding TTL
    r.expire(_key(token.strip()), SESSION_TTL_SEC)
    return data


def delete_session(token: str | None) -> None:
    if not token or not token.strip():
        return
    try:
        get_redis().delete(_key(token.strip()))
    except Exception:
        pass


def extract_token(
    cookie_header: str | None = None,
    authorization: str | None = None,
    body_token: str | None = None,
) -> str | None:
    if body_token and str(body_token).strip():
        return str(body_token).strip()
    if authorization:
        auth = authorization.strip()
        if auth.lower().startswith("bearer "):
            return auth[7:].strip()
    if cookie_header:
        for part in cookie_header.split(";"):
            name, _, value = part.strip().partition("=")
            if name == SESSION_COOKIE and value:
                return value.strip()
    return None
