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
from backend.storage.access import (
    AuthRequired,
    Forbidden,
    can_manage_group,
    is_admin,
    request_user,
    require_roles,
)
from backend.storage.audit_chain import hash_entry, verify_chain
from backend.storage.groups import (
    add_member,
    create_group,
    delete_group,
    get_group,
    group_reports,
    list_groups,
    list_members,
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
                        id, user_id, user_name, exercise_id, exercise_name,
                        completed_at, score_percent, penalty, qualified, payload
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (id) DO NOTHING
                    """,
                    (
                        report["id"],
                        report.get("userId") or None,
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
            prev_hash = ""
            for entry in read_json_list(AUDIT_PATH):
                if not isinstance(entry, dict) or not entry.get("id"):
                    continue
                record = {
                    "id": entry["id"],
                    "at": int(entry.get("at") or 0),
                    "actor": entry.get("actor") or "system",
                    "role": entry.get("role") or "system",
                    "action": entry.get("action") or "event",
                    "detail": entry.get("detail"),
                }
                entry_hash = entry.get("entry_hash") or hash_entry(record, prev_hash)
                row_prev = entry.get("prev_hash")
                if row_prev is None or row_prev == "":
                    row_prev = prev_hash
                conn.execute(
                    """
                    INSERT INTO audit_log (
                        id, at, actor, role, action, detail, prev_hash, entry_hash
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (id) DO NOTHING
                    """,
                    (
                        record["id"],
                        record["at"],
                        record["actor"],
                        record["role"],
                        record["action"],
                        record["detail"],
                        row_prev,
                        entry_hash,
                    ),
                )
                prev_hash = entry_hash
        conn.commit()

    # Backfill user_id for legacy reports matched by full_name
    with connect() as conn:
        conn.execute(
            """
            UPDATE trainee_reports r
            SET user_id = u.id
            FROM users u
            WHERE (r.user_id IS NULL OR btrim(r.user_id) = '')
              AND lower(u.full_name) = lower(r.user_name)
            """
        )
        # Mirror userId into payload JSON when missing
        rows = conn.execute(
            """
            SELECT id, user_id, payload
            FROM trainee_reports
            WHERE user_id IS NOT NULL AND btrim(user_id) <> ''
            """
        ).fetchall()
        for row in rows:
            payload = row["payload"]
            if not isinstance(payload, dict):
                continue
            if str(payload.get("userId") or "").strip():
                continue
            payload = {**payload, "userId": row["user_id"]}
            conn.execute(
                "UPDATE trainee_reports SET payload = %s WHERE id = %s",
                (jsonb(payload), row["id"]),
            )
        conn.commit()


def list_reports(*, for_user: dict | None = None, mine_only: bool = False) -> list:
    """Список отчётов. mine_only — только свои (для «Мои результаты» у dual-role)."""
    with connect() as conn:
        rows = conn.execute(
            "SELECT payload FROM trainee_reports ORDER BY completed_at DESC"
        ).fetchall()
    reports = [row["payload"] for row in rows]
    if for_user is None:
        return reports
    from backend.storage.access import is_admin, is_instructor, user_roles

    if mine_only:
        return [report for report in reports if report_belongs_to_user(report, for_user)]
    if is_admin(for_user) or is_instructor(for_user):
        return reports
    if "trainee" not in user_roles(for_user):
        return []
    return [report for report in reports if report_belongs_to_user(report, for_user)]


def save_report(report: dict) -> dict:
    if not isinstance(report, dict) or not report.get("id"):
        raise ValueError("report.id обязателен")

    user_id = str(report.get("userId") or "").strip() or None
    user_name = report.get("userName") or ""
    exercise_id = report.get("exerciseId") or ""
    score = int(report.get("scorePercent") or 0)
    penalty = int(report.get("penalty") or 0)
    completed_at = int(report.get("completedAt") or 0)

    with connect() as conn:
        existing_by_id = conn.execute(
            "SELECT id FROM trainee_reports WHERE id = %s LIMIT 1",
            (report["id"],),
        ).fetchone()
        # Дубликат по содержимому — только для НОВЫХ id (иначе update aiAnalysis/payload блокируется)
        if not existing_by_id:
            duplicate = conn.execute(
                """
                SELECT id FROM trainee_reports
                WHERE COALESCE(user_id, '') = COALESCE(%s, '')
                  AND user_name = %s
                  AND exercise_id = %s
                  AND score_percent = %s
                  AND penalty = %s
                  AND ABS(completed_at - %s) < 3000
                LIMIT 1
                """,
                (user_id, user_name, exercise_id, score, penalty, completed_at),
            ).fetchone()
            if duplicate:
                return {"ok": True, "id": report["id"], "duplicate": True}

        conn.execute(
            """
            INSERT INTO trainee_reports (
                id, user_id, user_name, exercise_id, exercise_name,
                completed_at, score_percent, penalty, qualified, payload
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (id) DO UPDATE SET
                user_id = EXCLUDED.user_id,
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
                user_id,
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


def get_report(report_id: str) -> dict | None:
    with connect() as conn:
        row = conn.execute(
            "SELECT payload FROM trainee_reports WHERE id = %s",
            (report_id,),
        ).fetchone()
    return row["payload"] if row else None


def report_belongs_to_user(report: dict, user: dict) -> bool:
    uid = str(user.get("id") or "").strip()
    report_uid = str(report.get("userId") or "").strip()
    if uid and report_uid:
        return report_uid == uid
    # Legacy rows without userId: match by display name / login
    names = {
        str(user.get("fullName") or "").strip().casefold(),
        str(user.get("login") or "").strip().casefold(),
    }
    names.discard("")
    return str(report.get("userName") or "").strip().casefold() in names


def clear_reports() -> dict:
    with connect() as conn:
        conn.execute("DELETE FROM trainee_reports")
        conn.commit()
    return {"ok": True}


def list_audit() -> list:
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT id, at, actor, role, action, detail, prev_hash, entry_hash
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
        last = conn.execute(
            """
            SELECT entry_hash FROM audit_log
            WHERE entry_hash IS NOT NULL AND btrim(entry_hash) <> ''
            ORDER BY at DESC
            LIMIT 1
            """
        ).fetchone()
        prev_hash = (last["entry_hash"] if last else "") or ""
        entry_hash = hash_entry(record, prev_hash)
        record["prev_hash"] = prev_hash
        record["entry_hash"] = entry_hash
        conn.execute(
            """
            INSERT INTO audit_log (
                id, at, actor, role, action, detail, prev_hash, entry_hash
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (id) DO NOTHING
            """,
            (
                record["id"],
                record["at"],
                record["actor"],
                record["role"],
                record["action"],
                record["detail"],
                prev_hash,
                entry_hash,
            ),
        )
        # Не обрезаем журнал: OFFSET-удаление ломает HMAC-цепочку.
        conn.commit()
    return record


def verify_audit_integrity() -> dict:
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT id, at, actor, role, action, detail, prev_hash, entry_hash
            FROM audit_log
            ORDER BY at ASC
            """
        ).fetchall()
    return verify_chain([dict(r) for r in rows])


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
    def _handle_auth_errors(self, exc: Exception) -> bool:
        if isinstance(exc, AuthRequired):
            self.send_error_json(exc, 401)
            return True
        if isinstance(exc, Forbidden):
            self.send_error_json(exc, 403)
            return True
        return False

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)
        if path == "/health":
            try:
                reports, audit = _counts()
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
            user = request_user(self)

            if path == "/reports":
                require_roles(user, "admin", "instructor", "trainee")
                mine = (query.get("mine") or [""])[0].lower() in ("1", "true", "yes")
                return self.send_json(list_reports(for_user=user, mine_only=mine))
            if path == "/audit":
                require_roles(user, "admin", "instructor")
                return self.send_json(list_audit())
            if path == "/audit/verify":
                require_roles(user, "admin", "instructor")
                return self.send_json(verify_audit_integrity())
            if path == "/metrics":
                require_roles(user, "admin", "instructor")
                from backend.common.metrics import snapshot

                return self.send_json(snapshot())
            if path == "/groups":
                instructor_id = (query.get("instructorId") or [""])[0]
                all_flag = (query.get("all") or [""])[0].lower() in (
                    "1",
                    "true",
                    "yes",
                )
                if all_flag:
                    require_roles(user, "admin")
                    return self.send_json(list_groups(None, all_groups=True))
                require_roles(user, "admin", "instructor")
                if not instructor_id:
                    if is_admin(user):
                        return self.send_error_json(
                            "Укажите instructorId или all=1", 400
                        )
                    instructor_id = user["id"]
                elif not is_admin(user) and instructor_id != user["id"]:
                    raise Forbidden("Можно смотреть только свои группы")
                return self.send_json(list_groups(instructor_id, all_groups=False))
            if path.startswith("/groups/") and path.endswith("/members"):
                group_id = path[len("/groups/") : -len("/members")]
                group = get_group(group_id)
                if not can_manage_group(user, group):
                    raise Forbidden("Нет доступа к этой группе")
                return self.send_json(list_members(group_id))
            if path.startswith("/groups/") and path.endswith("/reports"):
                group_id = path[len("/groups/") : -len("/reports")]
                group = get_group(group_id)
                if not can_manage_group(user, group):
                    raise Forbidden("Нет доступа к этой группе")
                return self.send_json(group_reports(group_id))
            self.send_error_json("not found", 404)
        except Exception as exc:
            if self._handle_auth_errors(exc):
                return
            if isinstance(exc, ValueError):
                return self.send_error_json(exc, 400)
            self.send_error_json(exc)

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        try:
            body = self.read_json()
            user = request_user(self)

            if path == "/reports":
                require_roles(user, "admin", "instructor", "trainee")
                # Автор всегда из сессии — клиент не может подменить userId/userName
                body = {
                    **body,
                    "userId": user["id"],
                    "userName": user.get("fullName") or user.get("login") or "",
                }
                return self.send_json(save_report(body), 201)
            if path == "/audit":
                require_roles(user, "admin", "instructor", "trainee")
                safe = {
                    **body,
                    "actor": user.get("fullName") or user.get("login") or "user",
                    "role": user.get("role") or "trainee",
                }
                return self.send_json(append_audit(safe), 201)
            if path == "/groups":
                require_roles(user, "admin", "instructor")
                instructor_id = str(body.get("instructorId") or "")
                if not is_admin(user):
                    instructor_id = user["id"]
                group = create_group(str(body.get("name") or ""), instructor_id)
                return self.send_json(group, 201)
            if path.startswith("/groups/") and path.endswith("/members"):
                group_id = path[len("/groups/") : -len("/members")]
                group = get_group(group_id)
                if not can_manage_group(user, group):
                    raise Forbidden("Нет доступа к этой группе")
                return self.send_json(
                    add_member(group_id, str(body.get("userId") or "")),
                    201,
                )
            self.send_error_json("not found", 404)
        except Exception as exc:
            if self._handle_auth_errors(exc):
                return
            if isinstance(exc, ValueError):
                return self.send_error_json(exc, 400)
            self.send_error_json(exc)

    def do_PATCH(self) -> None:
        path = urlparse(self.path).path
        try:
            body = self.read_json()
            user = request_user(self)
            if path.startswith("/groups/"):
                rest = path[len("/groups/") :]
                if "/" in rest:
                    return self.send_error_json("not found", 404)
                group_id = rest
                group = get_group(group_id)
                if "instructorId" in body:
                    require_roles(user, "admin")
                    return self.send_json(
                        set_group_instructor(
                            group_id, str(body.get("instructorId") or "")
                        )
                    )
                if "name" in body:
                    if not can_manage_group(user, group):
                        raise Forbidden("Нет доступа к этой группе")
                    return self.send_json(
                        rename_group(group_id, str(body.get("name") or ""))
                    )
                return self.send_error_json("instructorId or name required", 400)
            self.send_error_json("not found", 404)
        except Exception as exc:
            if self._handle_auth_errors(exc):
                return
            if isinstance(exc, ValueError):
                return self.send_error_json(exc, 400)
            self.send_error_json(exc)

    def do_DELETE(self) -> None:
        path = urlparse(self.path).path
        try:
            user = request_user(self)
            if path == "/reports":
                require_roles(user, "admin", "instructor")
                return self.send_json(clear_reports())
            if path.startswith("/reports/"):
                require_roles(user, "admin", "instructor", "trainee")
                report_id = path[len("/reports/") :]
                if not report_id:
                    return self.send_error_json("id required", 400)
                from backend.storage.access import is_admin, is_instructor

                existing = get_report(report_id)
                if existing is None:
                    return self.send_error_json("not found", 404)
                if not (is_admin(user) or is_instructor(user)):
                    if not report_belongs_to_user(existing, user):
                        raise Forbidden("Можно удалять только свои отчёты")
                return self.send_json(delete_report(report_id))
            if path == "/audit":
                require_roles(user, "admin", "instructor")
                return self.send_json(clear_audit())
            if path.startswith("/groups/") and "/members/" in path:
                rest = path[len("/groups/") :]
                group_id, _, member_part = rest.partition("/members/")
                user_id = member_part
                if not group_id or not user_id:
                    return self.send_error_json("groupId and userId required", 400)
                group = get_group(group_id)
                if not can_manage_group(user, group):
                    raise Forbidden("Нет доступа к этой группе")
                return self.send_json(remove_member(group_id, user_id))
            if path.startswith("/groups/"):
                group_id = path[len("/groups/") :]
                if not group_id or "/" in group_id:
                    return self.send_error_json("groupId required", 400)
                group = get_group(group_id)
                if not can_manage_group(user, group):
                    raise Forbidden("Нет доступа к этой группе")
                return self.send_json(delete_group(group_id))
            self.send_error_json("not found", 404)
        except Exception as exc:
            if self._handle_auth_errors(exc):
                return
            if isinstance(exc, ValueError):
                return self.send_error_json(exc, 400)
            self.send_error_json(exc)


def bootstrap() -> None:
    init_schema()
    wait_for_redis()
    _migrate_json_if_needed()
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
