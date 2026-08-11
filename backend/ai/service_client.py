"""Небольшой HTTP-клиент для внутренних AI-сервисов."""

from __future__ import annotations

import json
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


class ServiceUnavailable(RuntimeError):
    pass


def request_json(
    method: str,
    url: str,
    payload: dict[str, Any] | None = None,
    *,
    timeout: float = 15,
) -> dict[str, Any]:
    body = (
        json.dumps(payload, ensure_ascii=False).encode("utf-8")
        if payload is not None
        else None
    )
    request = Request(
        url,
        data=body,
        method=method,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urlopen(request, timeout=timeout) as response:
            raw = response.read()
    except HTTPError as exc:
        error_body = exc.read().decode("utf-8", errors="replace")
        raise ServiceUnavailable(
            f"{url}: HTTP {exc.code}: {error_body[:300]}"
        ) from exc
    except (URLError, OSError, TimeoutError) as exc:
        raise ServiceUnavailable(f"{url}: {exc}") from exc
    try:
        return json.loads(raw.decode("utf-8")) if raw else {}
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ServiceUnavailable(f"{url}: invalid JSON") from exc


def get_json(url: str, *, timeout: float = 5) -> dict[str, Any]:
    return request_json("GET", url, timeout=timeout)


def post_json(
    url: str,
    payload: dict[str, Any],
    *,
    timeout: float = 30,
) -> dict[str, Any]:
    return request_json("POST", url, payload, timeout=timeout)
