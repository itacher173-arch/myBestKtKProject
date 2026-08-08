"""Сервис хранения отчётов и аудита в PostgreSQL."""

from __future__ import annotations

import argparse
import time
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from backend.common.db import connect, init_schema, jsonb, safe_db_label
from backend.common.http import JsonHandler
from backend.common.json_store import read_json_list
from backend.common.redis_client import redis_status, wait_for_redis
from backend.storage.auth import (
    LoginRateLimitError,
    create_user,
    delete_user,
    ensure_bootstrap_admin,
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
)
from backend.storage.groups import (
    add_member,
    create_group,
    delete_group,
    group_reports,
    list_groups,
    list_instructors,
    list_members,
    list_trainees,
    remove_member,
    rename_group,
    set_group_instructor,
)
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


def _counts() -> tuple[int, int, int]:
    with connect() as conn:
        reports = conn.execute("SELECT COUNT(*) AS c FROM trainee_reports").fetchone()["c"]
        audit = conn.execute("SELECT COUNT(*) AS c FROM audit_log").fetchone()["c"]
    return int(reports), int(audit), users_count()


class Handler(JsonHandler):
    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)
        if path == "/health":
            try:
                reports, audit, users = _counts()
                redis = redis_status()
                status = "ok" if redis.get("status") == "ok" else "degraded"
                return self.send_json(
                    {
                        "status": status,
                        "service": "storage",
                        "backend": "postgresql",
                        "database": safe_db_label(),
                        "redis": redis,
                        "reports": reports,
                        "audit": audit,
                        "users": users,
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
        try:
            if path == "/auth/session":
                token = extract_token(
                    cookie_header=self.headers.get("Cookie"),
                    authorization=self.headers.get("Authorization"),
                )
                session = get_session(token)
                if not session:
                    return self.send_error_json("Требуется авторизация", 401)
                return self.send_json({"ok": True, "user": session["user"]})
            if path == "/auth/me":
                token = extract_token(
                    cookie_header=self.headers.get("Cookie"),
                    authorization=self.headers.get("Authorization"),
                )
                session = get_session(token)
                if not session:
                    return self.send_error_json("Требуется авторизация", 401)
                return self.send_json({"ok": True, "user": session["user"]})
            if path == "/reports":
                return self.send_json(list_reports())
            if path == "/audit":
                return self.send_json(list_audit())
            if path == "/users":
                role = (query.get("role") or [""])[0].strip()
                if role == "trainee":
                    return self.send_json(list_trainees())
                if role == "instructor":
                    return self.send_json(list_instructors())
                if role:
                    return self.send_json(list_users(role))
                return self.send_json(list_users())
            if path.startswith("/users/") and path.count("/") == 2:
                user_id = path[len("/users/") :]
                users = [u for u in list_users() if u["id"] == user_id]
                if not users:
                    return self.send_error_json("Пользователь не найден", 404)
                return self.send_json(users[0])
            if path == "/groups":
                instructor_id = (query.get("instructorId") or [""])[0]
                all_flag = (query.get("all") or [""])[0].lower() in (
                    "1",
                    "true",
                    "yes",
                )
                return self.send_json(
                    list_groups(instructor_id or None, all_groups=all_flag)
                )
            if path.startswith("/groups/") and path.endswith("/members"):
                group_id = path[len("/groups/") : -len("/members")]
                return self.send_json(list_members(group_id))
            if path.startswith("/groups/") and path.endswith("/reports"):
                group_id = path[len("/groups/") : -len("/reports")]
                return self.send_json(group_reports(group_id))
            self.send_error_json("not found", 404)
        except ValueError as exc:
            self.send_error_json(exc, 400)
        except Exception as exc:
            self.send_error_json(exc)

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        try:
            body = self.read_json()
            if path == "/reports":
                return self.send_json(save_report(body), 201)
            if path == "/audit":
                return self.send_json(append_audit(body), 201)
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
                try:
                    user = login_user(
                        str(body.get("login") or body.get("fullName") or ""),
                        str(body.get("password") or ""),
                        client_ip=client_ip,
                    )
                except LoginRateLimitError as exc:
                    return self.send_error_json(exc, 429)
                # Админ входит только в админ-панель (без app-сессии)
                if user["role"] == "admin":
                    return self.send_json({"ok": True, "user": user})
                token = create_session(user)
                cookie = (
                    f"{SESSION_COOKIE}={token}; Path=/; Max-Age={SESSION_TTL_SEC}; "
                    "HttpOnly; SameSite=Lax"
                )
                return self.send_json(
                    {"ok": True, "user": user, "token": token},
                    extra_headers={"Set-Cookie": cookie},
                )
            if path == "/auth/logout":
                token = extract_token(
                    cookie_header=self.headers.get("Cookie"),
                    authorization=self.headers.get("Authorization"),
                    body_token=str(body.get("token") or "") or None,
                )
                delete_session(token)
                expired = (
                    f"{SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax"
                )
                return self.send_json(
                    {"ok": True},
                    extra_headers={"Set-Cookie": expired},
                )
            if path == "/users":
                user = create_user(
                    str(body.get("fullName") or ""),
                    str(body.get("password") or ""),
                    str(body.get("role") or ""),
                    str(body.get("login") or ""),
                )
                return self.send_json({"ok": True, "user": user}, 201)
            if path == "/groups":
                group = create_group(
                    str(body.get("name") or ""),
                    str(body.get("instructorId") or ""),
                )
                return self.send_json(group, 201)
            if path.startswith("/groups/") and path.endswith("/members"):
                group_id = path[len("/groups/") : -len("/members")]
                return self.send_json(
                    add_member(group_id, str(body.get("userId") or "")),
                    201,
                )
            self.send_error_json("not found", 404)
        except LoginRateLimitError as exc:
            self.send_error_json(exc, 429)
        except ValueError as exc:
            self.send_error_json(exc, 400)
        except Exception as exc:
            self.send_error_json(exc)

    def do_PATCH(self) -> None:
        path = urlparse(self.path).path
        try:
            body = self.read_json()
            if path.startswith("/users/"):
                user_id = path[len("/users/") :]
                if not user_id or "/" in user_id:
                    return self.send_error_json("userId required", 400)
                full_name = body.get("fullName")
                password = body.get("password")
                role = body.get("role")
                login = body.get("login")
                user = update_user(
                    user_id,
                    login=str(login) if login is not None else None,
                    full_name=str(full_name) if full_name is not None else None,
                    password=str(password)
                    if password is not None and str(password)
                    else None,
                    role=str(role) if role is not None else None,
                )
                return self.send_json({"ok": True, "user": user})
            if path.startswith("/groups/"):
                rest = path[len("/groups/") :]
                if "/" in rest:
                    return self.send_error_json("not found", 404)
                group_id = rest
                if "instructorId" in body:
                    group = set_group_instructor(
                        group_id, str(body.get("instructorId") or "")
                    )
                    return self.send_json(group)
                if "name" in body:
                    group = rename_group(group_id, str(body.get("name") or ""))
                    return self.send_json(group)
                return self.send_error_json("instructorId or name required", 400)
            self.send_error_json("not found", 404)
        except ValueError as exc:
            self.send_error_json(exc, 400)
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
            if path.startswith("/users/"):
                user_id = path[len("/users/") :]
                if not user_id or "/" in user_id:
                    return self.send_error_json("userId required", 400)
                return self.send_json(delete_user(user_id))
            if path.startswith("/groups/") and "/members/" in path:
                # /groups/{id}/members/{userId}
                rest = path[len("/groups/") :]
                group_id, _, member_part = rest.partition("/members/")
                user_id = member_part
                if not group_id or not user_id:
                    return self.send_error_json("groupId and userId required", 400)
                return self.send_json(remove_member(group_id, user_id))
            if path.startswith("/groups/"):
                group_id = path[len("/groups/") :]
                if not group_id or "/" in group_id:
                    return self.send_error_json("groupId required", 400)
                return self.send_json(delete_group(group_id))
            self.send_error_json("not found", 404)
        except ValueError as exc:
            self.send_error_json(exc, 400)
        except Exception as exc:
            self.send_error_json(exc)


def bootstrap() -> None:
    init_schema()
    wait_for_redis()
    _migrate_json_if_needed()
    ensure_bootstrap_admin()
    print(f"[storage] PostgreSQL {safe_db_label()}", flush=True)
    print(f"[storage] Redis {redis_status().get('url') or 'ok'}", flush=True)


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
