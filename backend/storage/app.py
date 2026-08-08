"""Сервис хранения отчётов и аудита в PostgreSQL."""

from __future__ import annotations

import argparse
import time
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from backend.common.db import connect, init_schema, jsonb, safe_db_label
from backend.common.http import JsonHandler
from backend.common.json_store import read_json_list

BACKEND_ROOT = Path(__file__).resolve().parents[1]
RUNTIME = BACKEND_ROOT / "runtime"
REPORTS_PATH = RUNTIME / "reports.json"
AUDIT_PATH = RUNTIME / "audit.json"
AUDIT_MAX = 500


def _uid(prefix: str) -> str:
    return f"{prefix}-{int(time.time() * 1000)}-{int(time.time() * 1000) % 9973}"


def _migrate_json_if_needed() -> None:
    """Однократный перенос старых JSON в Postgres, если таблицы пустые."""
    with connect() as conn:
        reports_count = conn.execute("SELECT COUNT(*) AS c FROM trainee_reports").fetchone()["c"]
        audit_count = conn.execute("SELECT COUNT(*) AS c FROM audit_log").fetchone()["c"]

        if reports_count == 0 and REPORTS_PATH.is_file():
            for report in read_json_list(REPORTS_PATH):
                if not isinstance(report, dict) or not report.get("id"):
                    continue
                conn.execute(
                    """
                    INSERT INTO trainee_reports (
                        id, user_name, exercise_id, exercise_name,
                        completed_at, score_percent, penalty, qualified, payload
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (id) DO NOTHING
                    """,
                    (
                        report["id"],
                        report.get("userName") or "",
                        report.get("exerciseId") or "",
                        report.get("exerciseName") or "",
                        int(report.get("completedAt") or 0),
                        int(report.get("scorePercent") or 0),
                        int(report.get("penalty") or 0),
                        bool(report.get("qualified")),
                        jsonb(report),
                    ),
                )

        if audit_count == 0 and AUDIT_PATH.is_file():
            for entry in read_json_list(AUDIT_PATH):
                if not isinstance(entry, dict) or not entry.get("id"):
                    continue
                conn.execute(
                    """
                    INSERT INTO audit_log (id, at, actor, role, action, detail)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    ON CONFLICT (id) DO NOTHING
                    """,
                    (
                        entry["id"],
                        int(entry.get("at") or 0),
                        entry.get("actor") or "system",
                        entry.get("role") or "system",
                        entry.get("action") or "event",
                        entry.get("detail"),
                    ),
                )
        conn.commit()


def list_reports() -> list:
    with connect() as conn:
        rows = conn.execute(
            "SELECT payload FROM trainee_reports ORDER BY completed_at DESC"
        ).fetchall()
    return [row["payload"] for row in rows]


def save_report(report: dict) -> dict:
    if not isinstance(report, dict) or not report.get("id"):
        raise ValueError("report.id обязателен")

    user_name = report.get("userName") or ""
    exercise_id = report.get("exerciseId") or ""
    score = int(report.get("scorePercent") or 0)
    penalty = int(report.get("penalty") or 0)
    completed_at = int(report.get("completedAt") or 0)

    with connect() as conn:
        duplicate = conn.execute(
            """
            SELECT id FROM trainee_reports
            WHERE user_name = %s
              AND exercise_id = %s
              AND score_percent = %s
              AND penalty = %s
              AND ABS(completed_at - %s) < 3000
            LIMIT 1
            """,
            (user_name, exercise_id, score, penalty, completed_at),
        ).fetchone()
        if duplicate:
            return {"ok": True, "id": report["id"], "duplicate": True}

        conn.execute(
            """
            INSERT INTO trainee_reports (
                id, user_name, exercise_id, exercise_name,
                completed_at, score_percent, penalty, qualified, payload
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (id) DO UPDATE SET
                user_name = EXCLUDED.user_name,
                exercise_id = EXCLUDED.exercise_id,
                exercise_name = EXCLUDED.exercise_name,
                completed_at = EXCLUDED.completed_at,
                score_percent = EXCLUDED.score_percent,
                penalty = EXCLUDED.penalty,
                qualified = EXCLUDED.qualified,
                payload = EXCLUDED.payload
            """,
            (
                report["id"],
                user_name,
                exercise_id,
                report.get("exerciseName") or "",
                completed_at,
                score,
                penalty,
                bool(report.get("qualified")),
                jsonb(report),
            ),
        )
        conn.commit()
    return {"ok": True, "id": report["id"]}


def delete_report(report_id: str) -> dict:
    with connect() as conn:
        conn.execute("DELETE FROM trainee_reports WHERE id = %s", (report_id,))
        conn.commit()
    return {"ok": True, "id": report_id}


def clear_reports() -> dict:
    with connect() as conn:
        conn.execute("DELETE FROM trainee_reports")
        conn.commit()
    return {"ok": True}


def list_audit() -> list:
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT id, at, actor, role, action, detail
            FROM audit_log
            ORDER BY at DESC
            LIMIT %s
            """,
            (AUDIT_MAX,),
        ).fetchall()
    return [dict(row) for row in rows]


def append_audit(entry: dict) -> dict:
    record = {
        "id": entry.get("id") or _uid("aud"),
        "at": int(entry.get("at") or time.time() * 1000),
        "actor": entry.get("actor") or "system",
        "role": entry.get("role") or "system",
        "action": entry.get("action") or "event",
        "detail": entry.get("detail"),
    }
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO audit_log (id, at, actor, role, action, detail)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (id) DO NOTHING
            """,
            (
                record["id"],
                record["at"],
                record["actor"],
                record["role"],
                record["action"],
                record["detail"],
            ),
        )
        # Храним не больше AUDIT_MAX последних записей
        conn.execute(
            """
            DELETE FROM audit_log
            WHERE id IN (
                SELECT id FROM audit_log
                ORDER BY at DESC
                OFFSET %s
            )
            """,
            (AUDIT_MAX,),
        )
        conn.commit()
    return record


def clear_audit() -> dict:
    with connect() as conn:
        conn.execute("DELETE FROM audit_log")
        conn.commit()
    return {"ok": True}


def _counts() -> tuple[int, int]:
    with connect() as conn:
        reports = conn.execute("SELECT COUNT(*) AS c FROM trainee_reports").fetchone()["c"]
        audit = conn.execute("SELECT COUNT(*) AS c FROM audit_log").fetchone()["c"]
    return int(reports), int(audit)


class Handler(JsonHandler):
    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/health":
            try:
                reports, audit = _counts()
                return self.send_json(
                    {
                        "status": "ok",
                        "service": "storage",
                        "backend": "postgresql",
                        "database": safe_db_label(),
                        "reports": reports,
                        "audit": audit,
                    }
                )
            except Exception as exc:
                return self.send_json(
                    {
                        "status": "error",
                        "service": "storage",
                        "backend": "postgresql",
                        "error": str(exc),
                    },
                    503,
                )
        if path == "/reports":
            return self.send_json(list_reports())
        if path == "/audit":
            return self.send_json(list_audit())
        self.send_error_json("not found", 404)

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        try:
            body = self.read_json()
            if path == "/reports":
                return self.send_json(save_report(body), 201)
            if path == "/audit":
                return self.send_json(append_audit(body), 201)
            self.send_error_json("not found", 404)
        except Exception as exc:
            self.send_error_json(exc)

    def do_DELETE(self) -> None:
        path = urlparse(self.path).path
        try:
            if path == "/reports":
                return self.send_json(clear_reports())
            if path.startswith("/reports/"):
                report_id = path[len("/reports/") :]
                if not report_id:
                    return self.send_error_json("id required", 400)
                return self.send_json(delete_report(report_id))
            if path == "/audit":
                return self.send_json(clear_audit())
            self.send_error_json("not found", 404)
        except Exception as exc:
            self.send_error_json(exc)


def bootstrap() -> None:
    init_schema()
    _migrate_json_if_needed()
    print(f"[storage] PostgreSQL {safe_db_label()}", flush=True)


def main() -> None:
    bootstrap()
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8105)
    args = parser.parse_args()
    print(f"[storage] http://{args.host}:{args.port}", flush=True)
    ThreadingHTTPServer((args.host, args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
