"""Регистрация и вход пользователей (PostgreSQL)."""

from __future__ import annotations

import hashlib
import hmac
import os
import secrets
import time

from backend.common.db import connect

PBKDF2_ITERATIONS = 120_000
VALID_ROLES = ("trainee", "instructor", "admin")


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


def _validate_credentials(full_name: str, password: str, role: str | None = None) -> None:
    name = full_name.strip()
    if len(name) < 1:
        raise ValueError("ФИО: минимум 1 символ")
    if password is not None and len(password) < 4:
        raise ValueError("Пароль: минимум 4 символа")
    if role is not None and role not in VALID_ROLES:
        raise ValueError("Роль: обучаемый, инструктор или администратор")


def public_user(row: dict) -> dict:
    return {
        "id": row["id"],
        "fullName": row["full_name"],
        "role": row["role"],
        "createdAt": int(row["created_at"].timestamp() * 1000)
        if hasattr(row["created_at"], "timestamp")
        else None,
    }


def create_user(full_name: str, password: str, role: str) -> dict:
    """Создание пользователя (только админ-панель / API)."""
    _validate_credentials(full_name, password, role)
    name = full_name.strip()
    user_id = _uid()
    password_hash = hash_password(password)
    with connect() as conn:
        exists = conn.execute(
            "SELECT id FROM users WHERE lower(full_name) = lower(%s)",
            (name,),
        ).fetchone()
        if exists:
            raise ValueError("Пользователь с таким ФИО уже зарегистрирован")
        conn.execute(
            """
            INSERT INTO users (id, full_name, password_hash, role)
            VALUES (%s, %s, %s, %s)
            """,
            (user_id, name, password_hash, role),
        )
        row = conn.execute(
            "SELECT id, full_name, role, created_at FROM users WHERE id = %s",
            (user_id,),
        ).fetchone()
        conn.commit()
    return public_user(dict(row))


def login_user(full_name: str, password: str) -> dict:
    name = full_name.strip()
    if len(name) < 1:
        raise ValueError("ФИО: минимум 1 символ")
    if len(password) < 4:
        raise ValueError("Пароль: минимум 4 символа")
    with connect() as conn:
        row = conn.execute(
            """
            SELECT id, full_name, password_hash, role, created_at
            FROM users
            WHERE lower(full_name) = lower(%s)
            """,
            (name,),
        ).fetchone()
    if not row or not verify_password(password, row["password_hash"]):
        raise ValueError("Неверное ФИО или пароль")
    return public_user(dict(row))


def list_users(role: str | None = None) -> list[dict]:
    with connect() as conn:
        if role:
            if role not in VALID_ROLES:
                raise ValueError("Неизвестная роль")
            rows = conn.execute(
                """
                SELECT id, full_name, role, created_at
                FROM users
                WHERE role = %s
                ORDER BY full_name
                """,
                (role,),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT id, full_name, role, created_at
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
    full_name: str | None = None,
    password: str | None = None,
    role: str | None = None,
) -> dict:
    if not user_id.strip():
        raise ValueError("userId обязателен")
    if full_name is None and password is None and role is None:
        raise ValueError("Нечего обновлять")
    if role is not None and role not in VALID_ROLES:
        raise ValueError("Роль: обучаемый, инструктор или администратор")
    if password is not None and len(password) < 4:
        raise ValueError("Пароль: минимум 4 символа")
    if full_name is not None:
        name = full_name.strip()
        if len(name) < 1:
            raise ValueError("ФИО: минимум 1 символ")
    else:
        name = None

    with connect() as conn:
        row = conn.execute(
            "SELECT id, full_name, role, created_at FROM users WHERE id = %s",
            (user_id,),
        ).fetchone()
        if not row:
            raise ValueError("Пользователь не найден")

        if name is not None:
            clash = conn.execute(
                """
                SELECT id FROM users
                WHERE lower(full_name) = lower(%s) AND id <> %s
                """,
                (name, user_id),
            ).fetchone()
            if clash:
                raise ValueError("Пользователь с таким ФИО уже есть")
            conn.execute(
                "UPDATE users SET full_name = %s WHERE id = %s",
                (name, user_id),
            )

        if role is not None:
            # Нельзя снять последнего администратора
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
            "SELECT id, full_name, role, created_at FROM users WHERE id = %s",
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
    """Гарантирует учётку администратора (по умолчанию admin/admin)."""
    name = (os.environ.get("KTK_ADMIN_NAME") or "admin").strip()
    password = (os.environ.get("KTK_ADMIN_PASSWORD") or "admin").strip()
    if len(name) < 1 or len(password) < 4:
        raise ValueError("KTK_ADMIN_NAME/PASSWORD некорректны")
    password_hash = hash_password(password)
    with connect() as conn:
        by_name = conn.execute(
            "SELECT id FROM users WHERE lower(full_name) = lower(%s)",
            (name,),
        ).fetchone()
        if by_name:
            conn.execute(
                """
                UPDATE users
                SET role = 'admin', password_hash = %s, full_name = %s
                WHERE id = %s
                """,
                (password_hash, name, by_name["id"]),
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
                    SET full_name = %s, password_hash = %s, role = 'admin'
                    WHERE id = %s
                    """,
                    (name, password_hash, legacy["id"]),
                )
            else:
                conn.execute(
                    """
                    INSERT INTO users (id, full_name, password_hash, role)
                    VALUES (%s, %s, %s, 'admin')
                    """,
                    (_uid(), name, password_hash),
                )
        conn.commit()
    print(f"[storage] bootstrap admin: {name}", flush=True)
