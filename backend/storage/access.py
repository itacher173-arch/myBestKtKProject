"""Серверная авторизация storage API (сессия Redis + роли)."""

from __future__ import annotations

from typing import Any

from backend.storage.sessions import extract_token, get_session


class AuthRequired(Exception):
    status = 401


class Forbidden(Exception):
    status = 403


def user_roles(user: dict[str, Any]) -> set[str]:
    roles = user.get("roles")
    if isinstance(roles, list):
        return {str(role) for role in roles}
    role = user.get("role")
    return {str(role)} if role else set()


def request_user(handler: Any) -> dict[str, Any]:
    token = extract_token(
        cookie_header=handler.headers.get("Cookie"),
        authorization=handler.headers.get("Authorization"),
    )
    session = get_session(token)
    if not session or not session.get("user"):
        raise AuthRequired("Требуется авторизация")
    user = session["user"]
    if not isinstance(user, dict) or not user.get("id") or not user_roles(user):
        raise AuthRequired("Требуется авторизация")
    return user


def require_roles(user: dict[str, Any], *roles: str) -> None:
    if not user_roles(user).intersection(roles):
        raise Forbidden("Недостаточно прав")


def is_admin(user: dict[str, Any]) -> bool:
    return "admin" in user_roles(user)


def is_instructor(user: dict[str, Any]) -> bool:
    return "instructor" in user_roles(user)


def can_manage_group(user: dict[str, Any], group: dict[str, Any]) -> bool:
    if is_admin(user):
        return True
    if is_instructor(user) and group.get("instructorId") == user.get("id"):
        return True
    return False
