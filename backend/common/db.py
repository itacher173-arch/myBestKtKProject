"""Подключение к PostgreSQL и схема таблиц."""

from __future__ import annotations

import os
import time
from contextlib import contextmanager
from typing import Any, Iterator
from urllib.parse import urlparse, urlunparse

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

SCHEMA_STATEMENTS = (
    """
    CREATE TABLE IF NOT EXISTS trainee_reports (
        id TEXT PRIMARY KEY,
        user_name TEXT NOT NULL,
        exercise_id TEXT NOT NULL,
        exercise_name TEXT NOT NULL,
        completed_at BIGINT NOT NULL,
        score_percent INTEGER NOT NULL DEFAULT 0,
        penalty INTEGER NOT NULL DEFAULT 0,
        qualified BOOLEAN NOT NULL DEFAULT FALSE,
        payload JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_reports_completed_at
        ON trainee_reports (completed_at DESC)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_reports_user
        ON trainee_reports (user_name)
    """,
    """
    CREATE TABLE IF NOT EXISTS audit_log (
        id TEXT PRIMARY KEY,
        at BIGINT NOT NULL,
        actor TEXT NOT NULL,
        role TEXT NOT NULL,
        action TEXT NOT NULL,
        detail TEXT,
        prev_hash TEXT,
        entry_hash TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_audit_at
        ON audit_log (at DESC)
    """,
    """
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        login TEXT NOT NULL,
        full_name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('trainee', 'instructor', 'admin')),
        roles TEXT[] NOT NULL DEFAULT ARRAY['trainee']::TEXT[],
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (login)
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_users_role
        ON users (role)
    """,
    """
    CREATE TABLE IF NOT EXISTS training_groups (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        instructor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (instructor_id, name)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS group_members (
        group_id TEXT NOT NULL REFERENCES training_groups(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (group_id, user_id)
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_group_members_user
        ON group_members (user_id)
    """,
)

# Миграции для уже созданных БД (CREATE TABLE IF NOT EXISTS не меняет CHECK).
MIGRATION_STATEMENTS = (
    """
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check
    """,
    """
    ALTER TABLE users
        ADD CONSTRAINT users_role_check
        CHECK (role IN ('trainee', 'instructor', 'admin'))
    """,
    """
    ALTER TABLE users ADD COLUMN IF NOT EXISTS login TEXT
    """,
    """
    ALTER TABLE users ADD COLUMN IF NOT EXISTS roles TEXT[]
    """,
    """
    UPDATE users SET roles = ARRAY[role]::TEXT[]
    WHERE roles IS NULL OR cardinality(roles) = 0
    """,
    """
    ALTER TABLE users ALTER COLUMN roles
        SET DEFAULT ARRAY['trainee']::TEXT[]
    """,
    """
    ALTER TABLE users ALTER COLUMN roles SET NOT NULL
    """,
    """
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_roles_check
    """,
    """
    ALTER TABLE users
        ADD CONSTRAINT users_roles_check
        CHECK (
            cardinality(roles) > 0
            AND roles <@ ARRAY['trainee', 'instructor', 'admin']::TEXT[]
        )
    """,
    """
    ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS prev_hash TEXT
    """,
    """
    ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS entry_hash TEXT
    """,
)


def _migrate_user_logins(conn: Any) -> None:
    """Заполняет login у старых пользователей и включает UNIQUE."""
    conn.execute(
        """
        UPDATE users
        SET login = 'admin'
        WHERE role = 'admin'
          AND (login IS NULL OR btrim(login) = '')
          AND NOT EXISTS (
            SELECT 1 FROM users u2
            WHERE lower(u2.login) = 'admin' AND u2.id <> users.id
          )
        """
    )
    rows = conn.execute(
        """
        SELECT id FROM users
        WHERE login IS NULL OR btrim(login) = ''
        ORDER BY created_at
        """
    ).fetchall()
    for row in rows:
        uid = row["id"]
        base = f"user{uid[-6:].replace('-', '')}".lower()
        candidate = base
        n = 1
        while conn.execute(
            "SELECT 1 FROM users WHERE lower(login) = lower(%s)",
            (candidate,),
        ).fetchone():
            candidate = f"{base}{n}"
            n += 1
        conn.execute("UPDATE users SET login = %s WHERE id = %s", (candidate, uid))

    conn.execute(
        """
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'users' AND column_name = 'login'
              AND is_nullable = 'YES'
          ) THEN
            ALTER TABLE users ALTER COLUMN login SET NOT NULL;
          END IF;
        END $$;
        """
    )
    conn.execute(
        """
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'users_login_key'
          ) THEN
            ALTER TABLE users ADD CONSTRAINT users_login_key UNIQUE (login);
          END IF;
        END $$;
        """
    )
    conn.execute(
        """
        ALTER TABLE users DROP CONSTRAINT IF EXISTS users_full_name_key
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_users_login ON users (lower(login))"
    )


def database_url() -> str:
    url = os.environ.get("DATABASE_URL", "").strip()
    if url:
        return url
    return "postgresql://ktk:ktk@127.0.0.1:5432/ktk"


def wait_for_db(timeout_sec: float = 60.0) -> None:
    deadline = time.time() + timeout_sec
    last_error: Exception | None = None
    while time.time() < deadline:
        try:
            with connect() as conn:
                conn.execute("SELECT 1")
            return
        except Exception as exc:  # noqa: BLE001 — ждём готовности Postgres
            last_error = exc
            time.sleep(1.0)
    raise RuntimeError(f"PostgreSQL недоступен: {last_error}")


@contextmanager
def connect() -> Iterator[psycopg.Connection[Any]]:
    with psycopg.connect(database_url(), row_factory=dict_row) as conn:
        yield conn


def init_schema() -> None:
    wait_for_db()
    with connect() as conn:
        for statement in SCHEMA_STATEMENTS:
            conn.execute(statement)
        for statement in MIGRATION_STATEMENTS:
            conn.execute(statement)
        _migrate_user_logins(conn)
        conn.commit()


def jsonb(value: Any) -> Jsonb:
    return Jsonb(value)


def safe_db_label() -> str:
    """URL без пароля для логов/health."""
    parsed = urlparse(database_url())
    if parsed.password:
        netloc = parsed.netloc.replace(f":{parsed.password}", ":***", 1)
        return urlunparse(parsed._replace(netloc=netloc))
    return database_url()
