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
TRUE_VALUES = {"1", "true", "yes", "on"}


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


def normalize_roles(roles: str | list[str] | tuple[str, ...]) -> list[str]:
    values = [roles] if isinstance(roles, str) else list(roles)
    normalized: list[str] = []
    for role in values:
        value = str(role).strip().lower()
        if value not in VALID_ROLES:
            raise ValueError("Роли: обучаемый, инструктор или администратор")
        if value not in normalized:
            normalized.append(value)
    if not normalized:
        raise ValueError("Выберите минимум одну роль")
    return normalized


def primary_role(roles: list[str]) -> str:
    for role in ("admin", "instructor", "trainee"):
        if role in roles:
            return role
    raise ValueError("Выберите минимум одну роль")


def _validate_credentials(
    full_name: str,
    password: str | None,
    roles: str | list[str] | tuple[str, ...] | None = None,
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
    if roles is not None:
        normalize_roles(roles)


def public_user(row: dict) -> dict:
    roles = normalize_roles(row.get("roles") or row["role"])
    return {
        "id": row["id"],
        "login": row.get("login") or "",
        "fullName": row["full_name"],
        "role": primary_role(roles),
        "roles": roles,
        "createdAt": int(row["created_at"].timestamp() * 1000)
        if hasattr(row["created_at"], "timestamp")
        else None,
    }


def get_user_by_id(user_id: str) -> dict | None:
    if not user_id.strip():
        return None
    with connect() as conn:
        row = conn.execute(
            """
            SELECT id, login, full_name, role, roles, created_at
            FROM users WHERE id = %s
            """,
            (user_id,),
        ).fetchone()
    if not row:
        return None
    return public_user(dict(row))


def create_user(
    full_name: str,
    password: str,
    roles: str | list[str] | tuple[str, ...],
    login: str,
) -> dict:
    """Создание пользователя (только админ-панель / API)."""
    _validate_credentials(full_name, password, roles, login=login)
    name = full_name.strip()
    login_norm = validate_login(login)
    roles_norm = normalize_roles(roles)
    role = primary_role(roles_norm)
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
                INSERT INTO users (id, login, full_name, password_hash, role, roles)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (user_id, login_norm, name, password_hash, role, roles_norm),
            )
            row = conn.execute(
                """
                SELECT id, login, full_name, role, roles, created_at
                FROM users WHERE id = %s
                """,
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
            SELECT id, login, full_name, password_hash, role, roles, created_at
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
                SELECT id, login, full_name, role, roles, created_at
                FROM users
                WHERE %s = ANY(roles)
                ORDER BY full_name
                """,
                (role,),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT id, login, full_name, role, roles, created_at
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
    roles: list[str] | tuple[str, ...] | None = None,
) -> dict:
    if not user_id.strip():
        raise ValueError("userId обязателен")
    if (
        login is None
        and full_name is None
        and password is None
        and role is None
        and roles is None
    ):
        raise ValueError("Нечего обновлять")
    roles_norm = normalize_roles(roles if roles is not None else role) if (
        roles is not None or role is not None
    ) else None
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
            """
            SELECT id, login, full_name, role, roles, created_at
            FROM users WHERE id = %s
            """,
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

        if roles_norm is not None:
            old_roles = normalize_roles(row.get("roles") or row["role"])
            if "admin" in old_roles and "admin" not in roles_norm:
                admins = conn.execute(
                    "SELECT COUNT(*) AS c FROM users WHERE 'admin' = ANY(roles)"
                ).fetchone()["c"]
                if int(admins) <= 1:
                    raise ValueError("Нельзя снять роль у единственного администратора")
            conn.execute(
                "UPDATE users SET role = %s, roles = %s WHERE id = %s",
                (primary_role(roles_norm), roles_norm, user_id),
            )

        if password is not None:
            conn.execute(
                "UPDATE users SET password_hash = %s WHERE id = %s",
                (hash_password(password), user_id),
            )

        updated = conn.execute(
            """
            SELECT id, login, full_name, role, roles, created_at
            FROM users WHERE id = %s
            """,
            (user_id,),
        ).fetchone()
        conn.commit()
    return public_user(dict(updated))


def delete_user(user_id: str) -> dict:
    if not user_id.strip():
        raise ValueError("userId обязателен")
    with connect() as conn:
        row = conn.execute(
            "SELECT id, role, roles FROM users WHERE id = %s",
            (user_id,),
        ).fetchone()
        if not row:
            raise ValueError("Пользователь не найден")
        if "admin" in normalize_roles(row.get("roles") or row["role"]):
            admins = conn.execute(
                "SELECT COUNT(*) AS c FROM users WHERE 'admin' = ANY(roles)"
            ).fetchone()["c"]
            if int(admins) <= 1:
                raise ValueError("Нельзя удалить единственного администратора")
        conn.execute("DELETE FROM users WHERE id = %s", (user_id,))
        conn.commit()
    return {"ok": True, "id": user_id}


def users_count() -> int:
    with connect() as conn:
        return int(conn.execute("SELECT COUNT(*) AS c FROM users").fetchone()["c"])


def _bootstrap_admin_credentials() -> tuple[str, str, str]:
    login = (os.environ.get("KTK_ADMIN_LOGIN") or "").strip().lower()
    full_name = (os.environ.get("KTK_ADMIN_NAME") or "Администратор").strip()
    password = os.environ.get("KTK_ADMIN_PASSWORD") or ""
    if not login or not password:
        raise RuntimeError(
            "Для новой БД задайте KTK_ADMIN_LOGIN и KTK_ADMIN_PASSWORD "
            "через переменные окружения или менеджер секретов"
        )
    if not LOGIN_RE.match(login):
        raise ValueError("KTK_ADMIN_LOGIN некорректен")
    if len(full_name) < 1 or len(password) < 4:
        raise ValueError("KTK_ADMIN_NAME/PASSWORD некорректны")
    return login, full_name, password


def _demo_accounts_enabled() -> bool:
    value = (os.environ.get("KTK_DEMO_ACCOUNTS_ENABLED") or "").strip().casefold()
    return value in TRUE_VALUES


def _demo_account_specs() -> list[tuple[str, str, str, str]]:
    """Возвращает воспроизводимые учётные записи только для demo-профиля."""
    if not _demo_accounts_enabled():
        return []
    variables = (
        ("admin", "KTK_ADMIN", "Демо-администратор"),
        ("instructor", "KTK_DEMO_INSTRUCTOR", "Демо-инструктор"),
        ("trainee", "KTK_DEMO_TRAINEE", "Демо-обучаемый"),
    )
    accounts: list[tuple[str, str, str, str]] = []
    for role, prefix, default_name in variables:
        login = normalize_login(os.environ.get(f"{prefix}_LOGIN") or role)
        full_name = (os.environ.get(f"{prefix}_NAME") or default_name).strip()
        password = os.environ.get(f"{prefix}_PASSWORD") or role
        _validate_credentials(full_name, password, role, login=login)
        accounts.append((role, login, full_name, password))
    if len({account[1] for account in accounts}) != len(accounts):
        raise ValueError("Логины демо-пользователей должны отличаться")
    return accounts


def ensure_demo_accounts() -> None:
    """Идемпотентно создаёт демо-пользователей, группу и членство из окружения."""
    specs = _demo_account_specs()
    if not specs:
        return

    account_ids: dict[str, str] = {}
    with connect() as conn:
        for role, login, full_name, password in specs:
            user_id = _uid()
            row = conn.execute(
                """
                INSERT INTO users (
                    id, login, full_name, password_hash, role, roles
                )
                VALUES (%s, %s, %s, %s, %s, ARRAY[%s]::TEXT[])
                ON CONFLICT (login) DO UPDATE
                SET full_name = EXCLUDED.full_name,
                    password_hash = EXCLUDED.password_hash,
                    role = EXCLUDED.role,
                    roles = EXCLUDED.roles
                RETURNING id
                """,
                (
                    user_id,
                    login,
                    full_name,
                    hash_password(password),
                    role,
                    role,
                ),
            ).fetchone()
            account_ids[role] = str(row["id"])

        group_name = (
            os.environ.get("KTK_DEMO_GROUP_NAME") or "Демо-группа"
        ).strip()
        if not group_name:
            raise ValueError("KTK_DEMO_GROUP_NAME не может быть пустым")
        instructor_id = account_ids["instructor"]
        trainee_id = account_ids["trainee"]
        group = conn.execute(
            """
            SELECT id FROM training_groups
            WHERE instructor_id = %s AND lower(name) = lower(%s)
            """,
            (instructor_id, group_name),
        ).fetchone()
        if group:
            group_id = str(group["id"])
        else:
            group_id = f"grp-{int(time.time() * 1000)}-{secrets.token_hex(3)}"
            conn.execute(
                """
                INSERT INTO training_groups (id, name, instructor_id)
                VALUES (%s, %s, %s)
                """,
                (group_id, group_name, instructor_id),
            )
        conn.execute(
            """
            INSERT INTO group_members (group_id, user_id)
            VALUES (%s, %s)
            ON CONFLICT (group_id, user_id) DO NOTHING
            """,
            (group_id, trainee_id),
        )
        conn.commit()
    print(
        "[storage] demo accounts ready: admin, instructor, trainee; "
        f"group: {group_name}",
        flush=True,
    )


def ensure_bootstrap_admin() -> None:
    """Создаёт первого админа из окружения, не перезаписывая его пароль."""
    with connect() as conn:
        admin_count = int(
            conn.execute(
                "SELECT COUNT(*) AS c FROM users WHERE 'admin' = ANY(roles)"
            ).fetchone()["c"]
        )
        if admin_count > 0:
            conn.commit()
            print(f"[storage] bootstrap admin: already present ({admin_count})", flush=True)
            return

        login, full_name, password = _bootstrap_admin_credentials()

        by_login = conn.execute(
            "SELECT id FROM users WHERE lower(login) = lower(%s)",
            (login,),
        ).fetchone()
        if by_login:
            conn.execute(
                """
                UPDATE users
                SET role = 'admin',
                    roles = CASE
                        WHEN 'admin' = ANY(roles) THEN roles
                        ELSE array_append(roles, 'admin')
                    END
                WHERE id = %s
                """,
                (by_login["id"],),
            )
            conn.commit()
            print(f"[storage] bootstrap admin: promoted {login}", flush=True)
            return
        conn.execute(
            """
            INSERT INTO users (id, login, full_name, password_hash, role, roles)
            VALUES (%s, %s, %s, %s, 'admin', ARRAY['admin']::TEXT[])
            """,
            (_uid(), login, full_name, hash_password(password)),
        )
        conn.commit()
    print(f"[storage] bootstrap admin created: {login}", flush=True)
