"""Регистрация и вход пользователей (PostgreSQL)."""

from __future__ import annotations

import hashlib
import hmac
import os
import re
import secrets
import time

from backend.common.db import connect
from backend.common.redis_client import get_redis

try:
    from psycopg.errors import UniqueViolation
except ImportError:  # pragma: no cover
    UniqueViolation = Exception  # type: ignore[misc, assignment]

PBKDF2_ITERATIONS = 120_000
VALID_ROLES = ("trainee", "instructor", "admin")
LOGIN_FAIL_LIMIT = 8
LOGIN_FAIL_WINDOW_SEC = 15 * 60
LOGIN_RE = re.compile(r"^[a-zA-Z][a-zA-Z0-9_]{2,31}$")


class LoginRateLimitError(Exception):
    """Слишком много неудачных попыток входа."""

    status = 429


def _login_fail_key(login: str, client_ip: str) -> str:
    name = login.strip().lower()
    ip = (client_ip or "unknown").strip() or "unknown"
    return f"ktk:login:fail:{name}:{ip}"


def _assert_login_allowed(login: str, client_ip: str) -> None:
    try:
        r = get_redis()
        count = int(r.get(_login_fail_key(login, client_ip)) or 0)
    except Exception:
        return
    if count >= LOGIN_FAIL_LIMIT:
        raise LoginRateLimitError("Слишком много попыток, подождите")


def _record_login_failure(login: str, client_ip: str) -> None:
    try:
        r = get_redis()
        key = _login_fail_key(login, client_ip)
        pipe = r.pipeline()
        pipe.incr(key)
        pipe.expire(key, LOGIN_FAIL_WINDOW_SEC)
        pipe.execute()
    except Exception:
        pass


def _clear_login_failures(login: str, client_ip: str) -> None:
    try:
        get_redis().delete(_login_fail_key(login, client_ip))
    except Exception:
        pass


def _uid() -> str:
    return f"usr-{int(time.time() * 1000)}-{secrets.token_hex(3)}"


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        PBKDF2_ITERATIONS,
    ).hex()
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt}${digest}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        algo, iterations_s, salt, digest = encoded.split("$", 3)
        if algo != "pbkdf2_sha256":
            return False
        iterations = int(iterations_s)
    except ValueError:
        return False
    check = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        iterations,
    ).hex()
    return hmac.compare_digest(check, digest)


def normalize_login(login: str) -> str:
    return login.strip().lower()


def validate_login(login: str) -> str:
    value = login.strip()
    if not LOGIN_RE.match(value):
        raise ValueError(
            "Логин: 3–32 символа, латиница; начинается с буквы; только a-z, 0-9, _"
        )
    return value.lower()


def _validate_credentials(
    full_name: str,
    password: str | None,
    role: str | None = None,
    *,
    login: str | None = None,
) -> None:
    name = full_name.strip()
    if len(name) < 1:
        raise ValueError("ФИО: минимум 1 символ")
    if login is not None:
        validate_login(login)
    if password is not None and len(password) < 4:
        raise ValueError("Пароль: минимум 4 символа")
    if role is not None and role not in VALID_ROLES:
        raise ValueError("Роль: обучаемый, инструктор или администратор")


def public_user(row: dict) -> dict:
    return {
        "id": row["id"],
        "login": row.get("login") or "",
        "fullName": row["full_name"],
        "role": row["role"],
        "createdAt": int(row["created_at"].timestamp() * 1000)
        if hasattr(row["created_at"], "timestamp")
        else None,
    }


def create_user(full_name: str, password: str, role: str, login: str) -> dict:
    """Создание пользователя (только админ-панель / API)."""
    _validate_credentials(full_name, password, role, login=login)
    name = full_name.strip()
    login_norm = validate_login(login)
    user_id = _uid()
    password_hash = hash_password(password)
    try:
        with connect() as conn:
            exists = conn.execute(
                "SELECT id FROM users WHERE lower(login) = lower(%s)",
                (login_norm,),
            ).fetchone()
            if exists:
                raise ValueError("Пользователь с таким логином уже есть")
            conn.execute(
                """
                INSERT INTO users (id, login, full_name, password_hash, role)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (user_id, login_norm, name, password_hash, role),
            )
            row = conn.execute(
                "SELECT id, login, full_name, role, created_at FROM users WHERE id = %s",
                (user_id,),
            ).fetchone()
            conn.commit()
    except UniqueViolation as exc:
        raise ValueError("Пользователь с таким логином уже есть") from exc
    return public_user(dict(row))


def login_user(login: str, password: str, client_ip: str = "") -> dict:
    login_raw = login.strip()
    if len(login_raw) < 1:
        raise ValueError("Логин обязателен")
    if len(password) < 4:
        raise ValueError("Пароль: минимум 4 символа")
    login_key = login_raw.lower()
    _assert_login_allowed(login_key, client_ip)
    with connect() as conn:
        row = conn.execute(
            """
            SELECT id, login, full_name, password_hash, role, created_at
            FROM users
            WHERE lower(login) = lower(%s)
            """,
            (login_key,),
        ).fetchone()
    if not row or not verify_password(password, row["password_hash"]):
        _record_login_failure(login_key, client_ip)
        raise ValueError("Неверный логин или пароль")
    _clear_login_failures(login_key, client_ip)
    return public_user(dict(row))


def list_users(role: str | None = None) -> list[dict]:
    with connect() as conn:
        if role:
            if role not in VALID_ROLES:
                raise ValueError("Неизвестная роль")
            rows = conn.execute(
                """
                SELECT id, login, full_name, role, created_at
                FROM users
                WHERE role = %s
                ORDER BY full_name
                """,
                (role,),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT id, login, full_name, role, created_at
                FROM users
                ORDER BY
                    CASE role
                        WHEN 'admin' THEN 0
                        WHEN 'instructor' THEN 1
                        ELSE 2
                    END,
                    full_name
                """
            ).fetchall()
    return [public_user(dict(row)) for row in rows]


def update_user(
    user_id: str,
    *,
    login: str | None = None,
    full_name: str | None = None,
    password: str | None = None,
    role: str | None = None,
) -> dict:
    if not user_id.strip():
        raise ValueError("userId обязателен")
    if login is None and full_name is None and password is None and role is None:
        raise ValueError("Нечего обновлять")
    if role is not None and role not in VALID_ROLES:
        raise ValueError("Роль: обучаемый, инструктор или администратор")
    if password is not None and len(password) < 4:
        raise ValueError("Пароль: минимум 4 символа")
    login_norm = validate_login(login) if login is not None else None
    if full_name is not None:
        name = full_name.strip()
        if len(name) < 1:
            raise ValueError("ФИО: минимум 1 символ")
    else:
        name = None

    with connect() as conn:
        row = conn.execute(
            "SELECT id, login, full_name, role, created_at FROM users WHERE id = %s",
            (user_id,),
        ).fetchone()
        if not row:
            raise ValueError("Пользователь не найден")

        if login_norm is not None:
            clash = conn.execute(
                """
                SELECT id FROM users
                WHERE lower(login) = lower(%s) AND id <> %s
                """,
                (login_norm, user_id),
            ).fetchone()
            if clash:
                raise ValueError("Пользователь с таким логином уже есть")
            try:
                conn.execute(
                    "UPDATE users SET login = %s WHERE id = %s",
                    (login_norm, user_id),
                )
            except UniqueViolation as exc:
                raise ValueError("Пользователь с таким логином уже есть") from exc

        if name is not None:
            conn.execute(
                "UPDATE users SET full_name = %s WHERE id = %s",
                (name, user_id),
            )

        if role is not None:
            if row["role"] == "admin" and role != "admin":
                admins = conn.execute(
                    "SELECT COUNT(*) AS c FROM users WHERE role = 'admin'"
                ).fetchone()["c"]
                if int(admins) <= 1:
                    raise ValueError("Нельзя снять роль у единственного администратора")
            conn.execute(
                "UPDATE users SET role = %s WHERE id = %s",
                (role, user_id),
            )

        if password is not None:
            conn.execute(
                "UPDATE users SET password_hash = %s WHERE id = %s",
                (hash_password(password), user_id),
            )

        updated = conn.execute(
            "SELECT id, login, full_name, role, created_at FROM users WHERE id = %s",
            (user_id,),
        ).fetchone()
        conn.commit()
    return public_user(dict(updated))


def delete_user(user_id: str) -> dict:
    if not user_id.strip():
        raise ValueError("userId обязателен")
    with connect() as conn:
        row = conn.execute(
            "SELECT id, role FROM users WHERE id = %s",
            (user_id,),
        ).fetchone()
        if not row:
            raise ValueError("Пользователь не найден")
        if row["role"] == "admin":
            admins = conn.execute(
                "SELECT COUNT(*) AS c FROM users WHERE role = 'admin'"
            ).fetchone()["c"]
            if int(admins) <= 1:
                raise ValueError("Нельзя удалить единственного администратора")
        conn.execute("DELETE FROM users WHERE id = %s", (user_id,))
        conn.commit()
    return {"ok": True, "id": user_id}


def users_count() -> int:
    with connect() as conn:
        return int(conn.execute("SELECT COUNT(*) AS c FROM users").fetchone()["c"])


def ensure_bootstrap_admin() -> None:
    """Гарантирует учётку администратора (login/password: admin/admin)."""
    login = (os.environ.get("KTK_ADMIN_LOGIN") or "admin").strip().lower()
    full_name = (os.environ.get("KTK_ADMIN_NAME") or "Администратор").strip()
    password = (os.environ.get("KTK_ADMIN_PASSWORD") or "admin").strip()
    if not LOGIN_RE.match(login):
        raise ValueError("KTK_ADMIN_LOGIN некорректен")
    if len(full_name) < 1 or len(password) < 4:
        raise ValueError("KTK_ADMIN_NAME/PASSWORD некорректны")
    password_hash = hash_password(password)
    with connect() as conn:
        by_login = conn.execute(
            "SELECT id FROM users WHERE lower(login) = lower(%s)",
            (login,),
        ).fetchone()
        if by_login:
            conn.execute(
                """
                UPDATE users
                SET role = 'admin', password_hash = %s, full_name = %s, login = %s
                WHERE id = %s
                """,
                (password_hash, full_name, login, by_login["id"]),
            )
        else:
            legacy = conn.execute(
                """
                SELECT id FROM users
                WHERE role = 'admin'
                ORDER BY created_at
                LIMIT 1
                """
            ).fetchone()
            if legacy:
                conn.execute(
                    """
                    UPDATE users
                    SET login = %s, full_name = %s, password_hash = %s, role = 'admin'
                    WHERE id = %s
                    """,
                    (login, full_name, password_hash, legacy["id"]),
                )
            else:
                conn.execute(
                    """
                    INSERT INTO users (id, login, full_name, password_hash, role)
                    VALUES (%s, %s, %s, %s, 'admin')
                    """,
                    (_uid(), login, full_name, password_hash),
                )
        conn.commit()
    print(f"[storage] bootstrap admin: {login}", flush=True)
