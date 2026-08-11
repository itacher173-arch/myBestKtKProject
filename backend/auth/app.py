"""HTTP-сервис авторизации, сессий и управления пользователями."""

from __future__ import annotations

import argparse
import os
from http.server import ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from backend.common.db import init_schema, safe_db_label
from backend.common.http import JsonHandler
from backend.common.redis_client import redis_status, wait_for_redis
from backend.storage.access import AuthRequired, Forbidden, request_user, require_roles
from backend.storage.auth import (
    LoginRateLimitError,
    create_user,
    delete_user,
    ensure_bootstrap_admin,
    ensure_demo_accounts,
    get_user_by_id,
    list_users,
    login_user,
    update_user,
    users_count,
)
from backend.storage.sessions import (
    SESSION_COOKIE,
    SESSION_TTL_SEC,
    create_session,
    delete_session,
    extract_token,
    get_session,
    update_session_user,
)


class Handler(JsonHandler):
    def _cookie_flags(self) -> str:
        flags = "HttpOnly; SameSite=Lax"
        if os.environ.get("KTK_COOKIE_SECURE", "").strip().lower() in (
            "1",
            "true",
            "yes",
        ):
            flags += "; Secure"
        return flags

    def _session_cookie(self, token: str) -> str:
        return (
            f"{SESSION_COOKIE}={token}; Path=/; Max-Age={SESSION_TTL_SEC}; "
            f"{self._cookie_flags()}"
        )

    def _clear_session_cookie(self) -> str:
        return f"{SESSION_COOKIE}=; Path=/; Max-Age=0; {self._cookie_flags()}"

    def _handle_error(self, exc: Exception) -> None:
        if isinstance(exc, LoginRateLimitError):
            self.send_error_json(exc, 429)
        elif isinstance(exc, AuthRequired):
            self.send_error_json(exc, 401)
        elif isinstance(exc, Forbidden):
            self.send_error_json(exc, 403)
        elif isinstance(exc, ValueError):
            self.send_error_json(exc, 400)
        else:
            self.send_error_json(exc)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)
        try:
            if path == "/health":
                redis = redis_status()
                status = "ok" if redis.get("status") == "ok" else "degraded"
                return self.send_json(
                    {
                        "status": status,
                        "service": "auth",
                        "database": safe_db_label(),
                        "redis": redis,
                        "users": users_count(),
                    }
                )
            if path == "/auth/session":
                token = extract_token(
                    cookie_header=self.headers.get("Cookie"),
                    authorization=self.headers.get("Authorization"),
                )
                session = get_session(token)
                if not session:
                    return self.send_error_json("Требуется авторизация", 401)
                fresh = get_user_by_id(str(session["user"].get("id") or ""))
                if not fresh:
                    delete_session(token)
                    return self.send_error_json("Требуется авторизация", 401)
                updated = update_session_user(token, fresh) or session
                return self.send_json({"ok": True, "user": updated["user"]})
            if path == "/auth/me":
                user = request_user(self)
                token = extract_token(
                    cookie_header=self.headers.get("Cookie"),
                    authorization=self.headers.get("Authorization"),
                )
                fresh = get_user_by_id(str(user.get("id") or ""))
                if not fresh:
                    delete_session(token)
                    return self.send_error_json("Требуется авторизация", 401)
                updated = update_session_user(token, fresh)
                return self.send_json(
                    {"ok": True, "user": (updated or {}).get("user") or fresh}
                )

            user = request_user(self)
            if path == "/users":
                role = (query.get("role") or [""])[0].strip()
                if role == "trainee":
                    require_roles(user, "admin", "instructor")
                    return self.send_json(list_users("trainee"))
                require_roles(user, "admin")
                return self.send_json(list_users(role or None))
            if path.startswith("/users/") and path.count("/") == 2:
                require_roles(user, "admin")
                user_id = path[len("/users/") :]
                users = [item for item in list_users() if item["id"] == user_id]
                if not users:
                    return self.send_error_json("Пользователь не найден", 404)
                return self.send_json(users[0])
            self.send_error_json("not found", 404)
        except Exception as exc:
            self._handle_error(exc)

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        try:
            body = self.read_json()
            if path == "/auth/register":
                return self.send_error_json(
                    "Регистрация отключена. Пользователей создаёт администратор.",
                    403,
                )
            if path == "/auth/login":
                forwarded = self.headers.get("X-Forwarded-For") or ""
                client_ip = (
                    forwarded.split(",")[0].strip()
                    or self.headers.get("X-Real-IP")
                    or self.client_address[0]
                    or ""
                )
                user = login_user(
                    str(body.get("login") or body.get("fullName") or ""),
                    str(body.get("password") or ""),
                    client_ip=client_ip,
                )
                token = create_session(user)
                return self.send_json(
                    {"ok": True, "user": user, "token": token},
                    extra_headers={"Set-Cookie": self._session_cookie(token)},
                )
            if path == "/auth/logout":
                token = extract_token(
                    cookie_header=self.headers.get("Cookie"),
                    authorization=self.headers.get("Authorization"),
                    body_token=str(body.get("token") or "") or None,
                )
                delete_session(token)
                return self.send_json(
                    {"ok": True},
                    extra_headers={"Set-Cookie": self._clear_session_cookie()},
                )
            if path == "/users":
                require_roles(request_user(self), "admin")
                created = create_user(
                    str(body.get("fullName") or ""),
                    str(body.get("password") or ""),
                    body.get("roles") or str(body.get("role") or ""),
                    str(body.get("login") or ""),
                )
                return self.send_json({"ok": True, "user": created}, 201)
            self.send_error_json("not found", 404)
        except Exception as exc:
            self._handle_error(exc)

    def do_PATCH(self) -> None:
        path = urlparse(self.path).path
        try:
            body = self.read_json()
            require_roles(request_user(self), "admin")
            if path.startswith("/users/"):
                user_id = path[len("/users/") :]
                if not user_id or "/" in user_id:
                    return self.send_error_json("userId required", 400)
                password = body.get("password")
                updated = update_user(
                    user_id,
                    login=str(body["login"]) if "login" in body else None,
                    full_name=str(body["fullName"]) if "fullName" in body else None,
                    password=str(password) if password is not None and str(password) else None,
                    role=str(body["role"]) if "role" in body else None,
                    roles=body.get("roles") if isinstance(body.get("roles"), list) else None,
                )
                return self.send_json({"ok": True, "user": updated})
            self.send_error_json("not found", 404)
        except Exception as exc:
            self._handle_error(exc)

    def do_DELETE(self) -> None:
        path = urlparse(self.path).path
        try:
            require_roles(request_user(self), "admin")
            if path.startswith("/users/"):
                user_id = path[len("/users/") :]
                if not user_id or "/" in user_id:
                    return self.send_error_json("userId required", 400)
                return self.send_json(delete_user(user_id))
            self.send_error_json("not found", 404)
        except Exception as exc:
            self._handle_error(exc)


def bootstrap() -> None:
    init_schema()
    wait_for_redis()
    ensure_bootstrap_admin()
    ensure_demo_accounts()
    print(f"[auth] PostgreSQL {safe_db_label()}", flush=True)
    print(f"[auth] Redis {redis_status().get('url') or 'ok'}", flush=True)


def main() -> None:
    bootstrap()
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default=os.environ.get("KTK_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=8102)
    args = parser.parse_args()
    print(f"[auth] http://{args.host}:{args.port}", flush=True)
    ThreadingHTTPServer((args.host, args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
