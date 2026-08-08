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
