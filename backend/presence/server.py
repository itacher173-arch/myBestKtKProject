"""WebSocket presence: онлайн-статус и текущее упражнение обучаемых (Redis)."""

from __future__ import annotations

import asyncio
import json
import threading
import time
from typing import Any

from websockets.asyncio.server import ServerConnection, serve

from backend.common.redis_client import get_redis, wait_for_redis

Presence = dict[str, Any]

PRESENCE_TTL_SEC = 90
OFFLINE_TTL_SEC = 30
IDS_KEY = "ktk:presence:ids"


def _key(user_id: str) -> str:
    return f"ktk:presence:{user_id}"


def _snapshot() -> list[Presence]:
    r = get_redis()
    ids = list(r.smembers(IDS_KEY) or [])
    if not ids:
        return []
    keys = [_key(uid) for uid in ids]
    values = r.mget(keys)
    users: list[Presence] = []
    stale: list[str] = []
    for uid, raw in zip(ids, values):
        if not raw:
            stale.append(uid)
            continue
        try:
            users.append(json.loads(raw))
        except json.JSONDecodeError:
            stale.append(uid)
    if stale:
        r.srem(IDS_KEY, *stale)
    return users


def _set_presence(user_id: str, patch: Presence, *, ttl: int = PRESENCE_TTL_SEC) -> Presence:
    r = get_redis()
    key = _key(user_id)
    raw = r.get(key)
    current: Presence = {"userId": user_id}
    if raw:
        try:
            current.update(json.loads(raw))
        except json.JSONDecodeError:
            pass
    current.update(patch)
    current["userId"] = user_id
    current["updatedAt"] = int(time.time() * 1000)
    pipe = r.pipeline()
    pipe.set(key, json.dumps(current, ensure_ascii=False), ex=ttl)
    pipe.sadd(IDS_KEY, user_id)
    pipe.execute()
    return dict(current)


def _touch(user_id: str) -> None:
    """Продлевает TTL живого клиента (ping)."""
    r = get_redis()
    key = _key(user_id)
    if r.exists(key):
        r.expire(key, PRESENCE_TTL_SEC)
        r.sadd(IDS_KEY, user_id)


def _mark_offline(user_id: str) -> Presence | None:
    r = get_redis()
    key = _key(user_id)
    raw = r.get(key)
    if not raw:
        r.srem(IDS_KEY, user_id)
        return None
    try:
        current = json.loads(raw)
    except json.JSONDecodeError:
        r.delete(key)
        r.srem(IDS_KEY, user_id)
        return None
    current["online"] = False
    current["activity"] = "offline"
    current["catalogId"] = None
    current["catalogTitle"] = None
    current["sessionMode"] = None
    current["updatedAt"] = int(time.time() * 1000)
    r.set(key, json.dumps(current, ensure_ascii=False), ex=OFFLINE_TTL_SEC)
    r.sadd(IDS_KEY, user_id)
    return current


_clients: set[ServerConnection] = set()


async def _broadcast(message: dict[str, Any]) -> None:
    raw = json.dumps(message, ensure_ascii=False)
    dead: list[ServerConnection] = []
    for client in list(_clients):
        try:
            await client.send(raw)
        except Exception:
            dead.append(client)
    for client in dead:
        _clients.discard(client)


async def _handler(websocket: ServerConnection) -> None:
    user_id: str | None = None
    _clients.add(websocket)
    await websocket.send(
        json.dumps(
            {"type": "presence_snapshot", "users": _snapshot()},
            ensure_ascii=False,
        )
    )
    try:
        async for raw in websocket:
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue
            msg_type = msg.get("type")
            if msg_type == "hello":
                user_id = str(msg.get("userId") or "").strip()
                if not user_id:
                    continue
                entry = _set_presence(
                    user_id,
                    {
                        "fullName": str(msg.get("fullName") or ""),
                        "role": str(msg.get("role") or "trainee"),
                        "online": True,
                        "activity": str(msg.get("activity") or "online"),
                        "catalogId": msg.get("catalogId"),
                        "catalogTitle": msg.get("catalogTitle"),
                        "sessionMode": msg.get("sessionMode"),
                    },
                )
                await _broadcast({"type": "presence_update", "user": entry})
            elif msg_type == "presence":
                uid = str(msg.get("userId") or user_id or "").strip()
                if not uid:
                    continue
                user_id = uid
                entry = _set_presence(
                    uid,
                    {
                        "fullName": str(msg.get("fullName") or ""),
                        "role": str(msg.get("role") or "trainee"),
                        "online": bool(msg.get("online", True)),
                        "activity": str(msg.get("activity") or "online"),
                        "catalogId": msg.get("catalogId"),
                        "catalogTitle": msg.get("catalogTitle"),
                        "sessionMode": msg.get("sessionMode"),
                    },
                )
                await _broadcast({"type": "presence_update", "user": entry})
            elif msg_type == "ping":
                if user_id:
                    _touch(user_id)
                await websocket.send(json.dumps({"type": "pong"}))
    finally:
        _clients.discard(websocket)
        if user_id:
            offline = _mark_offline(user_id)
            if offline:
                await _broadcast({"type": "presence_update", "user": offline})


async def _run(host: str, port: int) -> None:
    async with serve(_handler, host, port):
        print(f"[presence] ws://{host}:{port} · Redis", flush=True)
        await asyncio.Future()


def start_presence_server(host: str = "0.0.0.0", port: int = 8106) -> None:
    wait_for_redis()

    def runner() -> None:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(_run(host, port))

    thread = threading.Thread(target=runner, name="ktk-presence-ws", daemon=True)
    thread.start()
