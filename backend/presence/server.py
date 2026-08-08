"""WebSocket presence: онлайн-статус и текущее упражнение обучаемых."""

from __future__ import annotations

import asyncio
import json
import threading
import time
from typing import Any

from websockets.asyncio.server import ServerConnection, serve

Presence = dict[str, Any]

_lock = threading.Lock()
_presence: dict[str, Presence] = {}
_clients: set[ServerConnection] = set()


def _snapshot() -> list[Presence]:
    with _lock:
        return [dict(item) for item in _presence.values()]


def _set_presence(user_id: str, patch: Presence) -> Presence:
    with _lock:
        current = _presence.get(user_id, {"userId": user_id})
        current.update(patch)
        current["userId"] = user_id
        current["updatedAt"] = int(time.time() * 1000)
        _presence[user_id] = current
        return dict(current)


def _mark_offline(user_id: str) -> Presence | None:
    with _lock:
        current = _presence.get(user_id)
        if not current:
            return None
        current = dict(current)
        current["online"] = False
        current["activity"] = "offline"
        current["catalogId"] = None
        current["catalogTitle"] = None
        current["sessionMode"] = None
        current["updatedAt"] = int(time.time() * 1000)
        _presence[user_id] = current
        return current


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
                await websocket.send(json.dumps({"type": "pong"}))
    finally:
        _clients.discard(websocket)
        if user_id:
            offline = _mark_offline(user_id)
            if offline:
                await _broadcast({"type": "presence_update", "user": offline})


async def _run(host: str, port: int) -> None:
    async with serve(_handler, host, port):
        print(f"[presence] ws://{host}:{port}", flush=True)
        await asyncio.Future()


def start_presence_server(host: str = "0.0.0.0", port: int = 8106) -> None:
    def runner() -> None:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(_run(host, port))

    thread = threading.Thread(target=runner, name="ktk-presence-ws", daemon=True)
    thread.start()
