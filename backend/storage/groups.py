"""Группы обучаемых для инструктора и администратора."""

from __future__ import annotations

import secrets
import time

from backend.common.db import connect


def _gid() -> str:
    return f"grp-{int(time.time() * 1000)}-{secrets.token_hex(3)}"


def _group_dict(row: dict, instructor_name: str | None = None) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "instructorId": row["instructor_id"],
        "instructorName": instructor_name
        if instructor_name is not None
        else row.get("instructor_name"),
        "memberCount": row.get("member_count", 0),
        "createdAt": int(row["created_at"].timestamp() * 1000)
        if hasattr(row["created_at"], "timestamp")
        else None,
    }


def list_trainees() -> list[dict]:
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT id, login, full_name, role, created_at
            FROM users
            WHERE role = 'trainee'
            ORDER BY full_name
            """
        ).fetchall()
    return [
        {
            "id": row["id"],
            "login": row.get("login") or "",
            "fullName": row["full_name"],
            "role": row["role"],
            "createdAt": int(row["created_at"].timestamp() * 1000)
            if hasattr(row["created_at"], "timestamp")
            else None,
        }
        for row in rows
    ]


def list_instructors() -> list[dict]:
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT id, login, full_name, role, created_at
            FROM users
            WHERE role = 'instructor'
            ORDER BY full_name
            """
        ).fetchall()
    return [
        {
            "id": row["id"],
            "login": row.get("login") or "",
            "fullName": row["full_name"],
            "role": row["role"],
            "createdAt": int(row["created_at"].timestamp() * 1000)
            if hasattr(row["created_at"], "timestamp")
            else None,
        }
        for row in rows
    ]


def list_groups(instructor_id: str | None = None, *, all_groups: bool = False) -> list[dict]:
    """Инструктор — только свои группы; админ — all_groups=True."""
    with connect() as conn:
        if all_groups:
            rows = conn.execute(
                """
                SELECT g.id, g.name, g.instructor_id, g.created_at,
                       u.full_name AS instructor_name,
                       COUNT(m.user_id)::int AS member_count
                FROM training_groups g
                JOIN users u ON u.id = g.instructor_id
                LEFT JOIN group_members m ON m.group_id = g.id
                GROUP BY g.id, u.full_name
                ORDER BY g.created_at DESC
                """
            ).fetchall()
        else:
            if not instructor_id or not instructor_id.strip():
                raise ValueError("instructorId обязателен")
            rows = conn.execute(
                """
                SELECT g.id, g.name, g.instructor_id, g.created_at,
                       u.full_name AS instructor_name,
                       COUNT(m.user_id)::int AS member_count
                FROM training_groups g
                JOIN users u ON u.id = g.instructor_id
                LEFT JOIN group_members m ON m.group_id = g.id
                WHERE g.instructor_id = %s
                GROUP BY g.id, u.full_name
                ORDER BY g.created_at DESC
                """,
                (instructor_id,),
            ).fetchall()
    return [_group_dict(dict(row)) for row in rows]


def create_group(name: str, instructor_id: str) -> dict:
    title = name.strip()
    if len(title) < 1:
        raise ValueError("Название группы: минимум 1 символ")
    if not instructor_id.strip():
        raise ValueError("instructorId обязателен")
    with connect() as conn:
        instructor = conn.execute(
            "SELECT id, full_name, role FROM users WHERE id = %s",
            (instructor_id,),
        ).fetchone()
        if not instructor or instructor["role"] != "instructor":
            raise ValueError("Инструктор не найден")
        exists = conn.execute(
            """
            SELECT id FROM training_groups
            WHERE instructor_id = %s AND lower(name) = lower(%s)
            """,
            (instructor_id, title),
        ).fetchone()
        if exists:
            raise ValueError("Группа с таким названием уже есть у этого инструктора")
        group_id = _gid()
        conn.execute(
            """
            INSERT INTO training_groups (id, name, instructor_id)
            VALUES (%s, %s, %s)
            """,
            (group_id, title, instructor_id),
        )
        conn.commit()
    return {
        "id": group_id,
        "name": title,
        "instructorId": instructor_id,
        "instructorName": instructor["full_name"],
        "memberCount": 0,
    }


def set_group_instructor(group_id: str, instructor_id: str) -> dict:
    if not group_id.strip():
        raise ValueError("groupId обязателен")
    if not instructor_id.strip():
        raise ValueError("instructorId обязателен")
    with connect() as conn:
        group = conn.execute(
            "SELECT id, name, instructor_id, created_at FROM training_groups WHERE id = %s",
            (group_id,),
        ).fetchone()
        if not group:
            raise ValueError("Группа не найдена")
        instructor = conn.execute(
            "SELECT id, full_name, role FROM users WHERE id = %s",
            (instructor_id,),
        ).fetchone()
        if not instructor or instructor["role"] != "instructor":
            raise ValueError("Инструктор не найден")
        clash = conn.execute(
            """
            SELECT id FROM training_groups
            WHERE instructor_id = %s AND lower(name) = lower(%s) AND id <> %s
            """,
            (instructor_id, group["name"], group_id),
        ).fetchone()
        if clash:
            raise ValueError("У инструктора уже есть группа с таким названием")
        conn.execute(
            "UPDATE training_groups SET instructor_id = %s WHERE id = %s",
            (instructor_id, group_id),
        )
        members = conn.execute(
            "SELECT COUNT(*) AS c FROM group_members WHERE group_id = %s",
            (group_id,),
        ).fetchone()["c"]
        conn.commit()
    return {
        "id": group_id,
        "name": group["name"],
        "instructorId": instructor_id,
        "instructorName": instructor["full_name"],
        "memberCount": int(members),
        "createdAt": int(group["created_at"].timestamp() * 1000)
        if hasattr(group["created_at"], "timestamp")
        else None,
    }


def rename_group(group_id: str, name: str) -> dict:
    title = name.strip()
    if len(title) < 1:
        raise ValueError("Название группы: минимум 1 символ")
    with connect() as conn:
        group = conn.execute(
            """
            SELECT g.id, g.name, g.instructor_id, g.created_at, u.full_name AS instructor_name
            FROM training_groups g
            JOIN users u ON u.id = g.instructor_id
            WHERE g.id = %s
            """,
            (group_id,),
        ).fetchone()
        if not group:
            raise ValueError("Группа не найдена")
        clash = conn.execute(
            """
            SELECT id FROM training_groups
            WHERE instructor_id = %s AND lower(name) = lower(%s) AND id <> %s
            """,
            (group["instructor_id"], title, group_id),
        ).fetchone()
        if clash:
            raise ValueError("Группа с таким названием уже есть у этого инструктора")
        conn.execute(
            "UPDATE training_groups SET name = %s WHERE id = %s",
            (title, group_id),
        )
        members = conn.execute(
            "SELECT COUNT(*) AS c FROM group_members WHERE group_id = %s",
            (group_id,),
        ).fetchone()["c"]
        conn.commit()
    return {
        "id": group_id,
        "name": title,
        "instructorId": group["instructor_id"],
        "instructorName": group["instructor_name"],
        "memberCount": int(members),
    }


def delete_group(group_id: str) -> dict:
    with connect() as conn:
        deleted = conn.execute(
            "DELETE FROM training_groups WHERE id = %s RETURNING id",
            (group_id,),
        ).fetchone()
        if not deleted:
            raise ValueError("Группа не найдена")
        conn.commit()
    return {"ok": True, "id": group_id}


def list_members(group_id: str) -> list[dict]:
    with connect() as conn:
        group = conn.execute(
            "SELECT id FROM training_groups WHERE id = %s",
            (group_id,),
        ).fetchone()
        if not group:
            raise ValueError("Группа не найдена")
        rows = conn.execute(
            """
            SELECT u.id, u.login, u.full_name, u.role, m.added_at
            FROM group_members m
            JOIN users u ON u.id = m.user_id
            WHERE m.group_id = %s
            ORDER BY u.full_name
            """,
            (group_id,),
        ).fetchall()
    return [
        {
            "id": row["id"],
            "login": row.get("login") or "",
            "fullName": row["full_name"],
            "role": row["role"],
            "addedAt": int(row["added_at"].timestamp() * 1000)
            if hasattr(row["added_at"], "timestamp")
            else None,
        }
        for row in rows
    ]


def add_member(group_id: str, user_id: str) -> dict:
    if not user_id.strip():
        raise ValueError("userId обязателен")
    with connect() as conn:
        group = conn.execute(
            "SELECT id FROM training_groups WHERE id = %s",
            (group_id,),
        ).fetchone()
        if not group:
            raise ValueError("Группа не найдена")
        user = conn.execute(
            "SELECT id, full_name, role FROM users WHERE id = %s",
            (user_id,),
        ).fetchone()
        if not user:
            raise ValueError("Пользователь не найден")
        if user["role"] != "trainee":
            raise ValueError("В группу можно добавить только обучаемого")
        conn.execute(
            """
            INSERT INTO group_members (group_id, user_id)
            VALUES (%s, %s)
            ON CONFLICT DO NOTHING
            """,
            (group_id, user_id),
        )
        conn.commit()
    return {
        "ok": True,
        "groupId": group_id,
        "userId": user_id,
        "fullName": user["full_name"],
    }


def remove_member(group_id: str, user_id: str) -> dict:
    with connect() as conn:
        conn.execute(
            "DELETE FROM group_members WHERE group_id = %s AND user_id = %s",
            (group_id, user_id),
        )
        conn.commit()
    return {"ok": True, "groupId": group_id, "userId": user_id}


def group_reports(group_id: str) -> list:
    with connect() as conn:
        group = conn.execute(
            "SELECT id FROM training_groups WHERE id = %s",
            (group_id,),
        ).fetchone()
        if not group:
            raise ValueError("Группа не найдена")
        rows = conn.execute(
            """
            SELECT r.payload
            FROM trainee_reports r
            WHERE EXISTS (
                SELECT 1
                FROM group_members m
                JOIN users u ON u.id = m.user_id
                WHERE m.group_id = %s
                  AND lower(u.full_name) = lower(r.user_name)
            )
            ORDER BY r.completed_at DESC
            """,
            (group_id,),
        ).fetchall()
    return [row["payload"] for row in rows]
