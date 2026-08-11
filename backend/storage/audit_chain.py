"""Цепочка целостности аудита: HMAC-SHA256 + prev_hash."""

from __future__ import annotations

import hashlib
import hmac
import json
import os
from typing import Any


def audit_secret() -> bytes:
    raw = (os.environ.get("KTK_AUDIT_HMAC_SECRET") or "").strip()
    if not raw:
        # Локальный fallback только при явном разрешении
        if os.environ.get("KTK_ALLOW_INSECURE_DEFAULTS", "").casefold() in {
            "1",
            "true",
            "yes",
        }:
            raw = "ktk-dev-audit-secret"
        else:
            raise RuntimeError(
                "Задайте KTK_AUDIT_HMAC_SECRET (или KTK_ALLOW_INSECURE_DEFAULTS=1 для локальной разработки)"
            )
    return raw.encode("utf-8")


def canonicalize(entry: dict[str, Any], prev_hash: str) -> str:
    payload = {
        "id": entry.get("id"),
        "at": entry.get("at"),
        "actor": entry.get("actor"),
        "role": entry.get("role"),
        "action": entry.get("action"),
        "detail": entry.get("detail"),
        "prev_hash": prev_hash,
    }
    return json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def hash_entry(entry: dict[str, Any], prev_hash: str) -> str:
    body = canonicalize(entry, prev_hash)
    return hmac.new(audit_secret(), body.encode("utf-8"), hashlib.sha256).hexdigest()


def verify_chain(rows: list[dict[str, Any]]) -> dict[str, Any]:
    """rows в порядке at ASC (от старых к новым)."""
    prev = ""
    checked = 0
    for row in rows:
        expected_prev = row.get("prev_hash") or ""
        if expected_prev != prev:
            return {
                "ok": False,
                "checked": checked,
                "error": f"Разрыв цепочки на {row.get('id')}: prev_hash",
            }
        entry_hash = row.get("entry_hash") or ""
        calc = hash_entry(row, prev)
        if entry_hash and entry_hash != calc:
            return {
                "ok": False,
                "checked": checked,
                "error": f"Неверная подпись {row.get('id')}",
            }
        prev = entry_hash or calc
        checked += 1
    return {"ok": True, "checked": checked, "tip": prev}
