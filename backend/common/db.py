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
        full_name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('trainee', 'instructor', 'admin')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (full_name)
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
