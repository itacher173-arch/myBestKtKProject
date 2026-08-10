from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time
import uuid
from pathlib import Path
from typing import Any

USERS_PATH = Path(__file__).parent / "users.json"
ITERATIONS = 150_000
TOKEN_TTL_SECONDS = int(os.getenv("KTK_AUTH_TTL_SECONDS", "28800"))
AUTH_SECRET = os.getenv(
    "KTK_AUTH_SECRET",
    "ktk-prototype-development-secret-change-before-shared-deployment",
).encode("utf-8")


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _decode_b64url(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def load_users() -> list[dict[str, str]]:
    return json.loads(USERS_PATH.read_text(encoding="utf-8"))


def public_user(user: dict[str, str]) -> dict[str, str]:
    return {
        "username": user["username"],
        "displayName": user["displayName"],
        "role": user["role"],
        "position": user["position"],
    }


def authenticate(username: str, password: str) -> dict[str, str] | None:
    normalized = username.strip().casefold()
    for user in load_users():
        if user["username"].casefold() != normalized:
            continue
        actual = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            user["salt"].encode("utf-8"),
            ITERATIONS,
        )
        expected = base64.b64decode(user["passwordHash"])
        return user if hmac.compare_digest(actual, expected) else None
    return None


def issue_token(user: dict[str, str]) -> tuple[str, int]:
    expires_at = int(time.time()) + TOKEN_TTL_SECONDS
    payload = {
        "sub": user["username"],
        "name": user["displayName"],
        "role": user["role"],
        "position": user["position"],
        "iat": int(time.time()),
        "exp": expires_at,
        "jti": uuid.uuid4().hex,
    }
    encoded = _b64url(json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
    signature = _b64url(hmac.new(AUTH_SECRET, encoded.encode("ascii"), hashlib.sha256).digest())
    return f"{encoded}.{signature}", expires_at * 1000


def verify_token(token: str) -> dict[str, Any]:
    try:
        encoded, signature = token.split(".", 1)
        expected = _b64url(hmac.new(AUTH_SECRET, encoded.encode("ascii"), hashlib.sha256).digest())
        if not hmac.compare_digest(signature, expected):
            raise ValueError("invalid signature")
        payload = json.loads(_decode_b64url(encoded).decode("utf-8"))
        if int(payload.get("exp", 0)) <= int(time.time()):
            raise ValueError("token expired")
        return payload
    except Exception as exc:
        raise ValueError("Недействительная или истёкшая сессия") from exc
