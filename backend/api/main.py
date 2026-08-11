"""
FastAPI: health/metrics, валидация сценариев, серверный симулятор (HTTP + WS).
"""

from __future__ import annotations

import os
import time
from typing import Any

from fastapi import Depends, FastAPI, Header, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from backend.common.metrics import add_gauge, inc, set_gauge, snapshot
from backend.scenarios.schema import validate_scenario_dict
from backend.storage.sessions import extract_token, get_session

app = FastAPI(title="КТК ЭЛОУ-АВТ API", version="0.2.0")

_origins = [
    o.strip()
    for o in (
        os.environ.get(
            "KTK_CORS_ORIGINS",
            "http://localhost:8080,http://localhost:8081,http://localhost:8082",
        )
    ).split(",")
    if o.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def current_user(
    authorization: str | None = Header(default=None),
    cookie: str | None = Header(default=None, alias="Cookie"),
) -> dict[str, Any]:
    token = extract_token(cookie_header=cookie, authorization=authorization)
    session = get_session(token)
    if not session or not session.get("user"):
        raise HTTPException(401, "Требуется авторизация")
    return session["user"]


def has_any_role(user: dict[str, Any], *roles: str) -> bool:
    assigned = user.get("roles")
    if not isinstance(assigned, list):
        assigned = [user.get("role")]
    return bool(set(roles).intersection(str(role) for role in assigned if role))


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {"status": "ok", "service": "fastapi", "metrics": snapshot()}


@app.get("/api/ready")
def ready() -> dict[str, str]:
    return {"status": "ready"}


@app.get("/api/live")
def live() -> dict[str, str]:
    return {"status": "live"}


@app.get("/api/metrics")
def metrics(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    if not has_any_role(user, "admin", "instructor"):
        raise HTTPException(403, "Недостаточно прав")
    return snapshot()


class ScenarioIn(BaseModel):
    scenario: dict[str, Any] = Field(..., description="Документ сценария")


@app.post("/api/scenarios/validate")
def validate_scenario(
    body: ScenarioIn,
    user: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
    if not has_any_role(user, "admin", "instructor"):
        raise HTTPException(403, "Недостаточно прав")
    return validate_scenario_dict(body.scenario)


class SimCreate(BaseModel):
    exerciseId: str | None = None
    initial: dict[str, Any] | None = None
    warmStart: bool = False
    seed: int | str | None = None
    modelVersion: str | None = None
    scenarioVersion: str | None = None
    faultType: str | None = None
    triggerDelaySeconds: float | None = None
    timeScale: float = 1.0


class SimCommand(BaseModel):
    action: str
    payload: dict[str, Any] = Field(default_factory=dict)


class SimCheckpointIn(BaseModel):
    clientState: dict[str, Any]


@app.post("/api/sim/sessions")
def create_sim_session(
    body: SimCreate,
    user: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
    from backend.simulator.session import store
    from backend.simulator.checkpoint_store import (
        delete_session,
        get_active,
        save_session,
    )

    active_checkpoint = get_active(user["id"])
    if active_checkpoint:
        active_session_id = str(active_checkpoint["sessionId"])
        store.delete(active_session_id)
        delete_session(active_session_id, user["id"])
    sess = store.create(
        user_id=user["id"],
        exercise_id=body.exerciseId,
        initial=body.initial,
        warm_start=body.warmStart,
        seed=body.seed,
        model_version=body.modelVersion,
        scenario_version=body.scenarioVersion,
        fault_type=body.faultType,
        trigger_delay_sec=body.triggerDelaySeconds,
        time_scale=body.timeScale,
    )
    inc("sim_sessions")
    set_gauge("sim_active_sessions", store.active_count())
    save_session(sess.checkpoint())
    return {"ok": True, "session": sess.public()}


@app.get("/api/sim/sessions/active")
def get_active_sim_session(
    user: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
    from backend.simulator.checkpoint_store import get_active, save_session
    from backend.simulator.session import store

    checkpoint = get_active(user["id"])
    if not checkpoint:
        return {"ok": True, "checkpoint": None}
    session_data = checkpoint.get("session")
    if not isinstance(session_data, dict):
        return {"ok": True, "checkpoint": None}
    sess = store.restore(session_data)
    # Opening the recovery prompt must not let model time continue in background.
    sess.paused = True
    sess.last_seen_at = time.time()
    saved_at = checkpoint.get("savedAt")
    refreshed = save_session(sess.checkpoint())
    refreshed["savedAt"] = saved_at
    return {"ok": True, "checkpoint": refreshed}


@app.get("/api/sim/sessions/{session_id}")
def get_sim_session(
    session_id: str,
    user: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
    from backend.simulator.session import store

    sess = store.get(session_id)
    if not sess:
        raise HTTPException(404, "Сессия не найдена")
    if sess.user_id != user["id"] and not has_any_role(user, "admin", "instructor"):
        raise HTTPException(404, "Сессия не найдена")
    store.touch(session_id)
    return {"ok": True, "session": sess.public()}


@app.put("/api/sim/sessions/{session_id}/checkpoint")
def save_sim_checkpoint(
    session_id: str,
    body: SimCheckpointIn,
    user: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
    from backend.simulator.checkpoint_store import save_session
    from backend.simulator.session import store

    sess = store.get(session_id)
    if not sess or sess.user_id != user["id"]:
        raise HTTPException(404, "Сессия не найдена")
    store.touch(session_id)
    checkpoint = save_session(sess.checkpoint(), client_state=body.clientState)
    return {"ok": True, "savedAt": checkpoint["savedAt"]}


@app.post("/api/sim/sessions/{session_id}/resume")
def resume_sim_session(
    session_id: str,
    user: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
    from backend.simulator.checkpoint_store import get_by_id, save_session
    from backend.simulator.session import store

    checkpoint = get_by_id(session_id)
    if not checkpoint or checkpoint.get("userId") != user["id"]:
        raise HTTPException(404, "Сессия не найдена")
    sess = store.restore(checkpoint["session"])
    store.touch(session_id)
    refreshed = save_session(sess.checkpoint())
    refreshed["clientState"] = checkpoint.get("clientState")
    return {"ok": True, "checkpoint": refreshed}


@app.post("/api/sim/sessions/{session_id}/abandon")
def abandon_sim_session(
    session_id: str,
    user: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
    from backend.simulator.checkpoint_store import delete_session, get_by_id
    from backend.simulator.session import store

    checkpoint = get_by_id(session_id)
    if not checkpoint or checkpoint.get("userId") != user["id"]:
        raise HTTPException(404, "Сессия не найдена")
    store.delete(session_id)
    delete_session(session_id, user["id"])
    set_gauge("sim_active_sessions", store.active_count())
    return {"ok": True}


@app.post("/api/sim/sessions/{session_id}/complete")
def complete_sim_session(
    session_id: str,
    user: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
    from backend.simulator.checkpoint_store import delete_session
    from backend.simulator.session import store

    sess = store.get(session_id)
    if not sess or sess.user_id != user["id"]:
        raise HTTPException(404, "Сессия не найдена")
    sess.running = False
    sess.process["running"] = False
    store.delete(session_id)
    delete_session(session_id, user["id"])
    set_gauge("sim_active_sessions", store.active_count())
    return {"ok": True}


@app.post("/api/sim/sessions/{session_id}/command")
def sim_command(
    session_id: str,
    body: SimCommand,
    user: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
    from backend.simulator.checkpoint_store import save_session
    from backend.simulator.session import store

    sess = store.get(session_id)
    if not sess or (
        sess.user_id != user["id"] and not has_any_role(user, "admin", "instructor")
    ):
        raise HTTPException(404, "Сессия не найдена")
    if body.action == "restore-snapshot" and not has_any_role(
        user, "admin", "instructor"
    ):
        raise HTTPException(403, "Восстановление снимка доступно только инструктору")
    result = store.apply_command(session_id, body.action, body.payload)
    store.touch(session_id)
    live = store.get(session_id)
    if live is not None:
        save_session(live.checkpoint())
    inc("sim_commands")
    if not result.get("ok"):
        inc("sim_rejected")
    return result


@app.websocket("/api/sim/ws/{session_id}")
async def sim_ws(websocket: WebSocket, session_id: str) -> None:
    from backend.simulator.checkpoint_store import save_session
    from backend.simulator.session import store
    from backend.storage.sessions import extract_token, get_session

    token = extract_token(
        cookie_header=websocket.headers.get("cookie"),
        authorization=websocket.headers.get("authorization"),
        body_token=websocket.query_params.get("token"),
    )
    auth = get_session(token)
    user = auth.get("user") if auth else None
    if not user:
        await websocket.close(code=4401)
        return

    sess = store.get(session_id)
    if not sess or (
        sess.user_id != user["id"] and not has_any_role(user, "admin", "instructor")
    ):
        await websocket.close(code=4403)
        return

    await websocket.accept()
    add_gauge("ws_active", 1)
    inc("ws_connections")
    try:
        while True:
            msg = await websocket.receive_json()
            inc("ws_events")
            kind = msg.get("type")
            if kind == "command":
                # Re-check ownership each command (session may expire)
                live = store.get(session_id)
                if not live or (
                    live.user_id != user["id"]
                    and not has_any_role(user, "admin", "instructor")
                ):
                    await websocket.send_json(
                        {"type": "error", "error": "forbidden"}
                    )
                    break
                result = store.apply_command(
                    session_id,
                    str(msg.get("action") or ""),
                    msg.get("payload") or {},
                )
                store.touch(session_id)
                changed = store.get(session_id)
                if changed is not None:
                    save_session(changed.checkpoint())
                await websocket.send_json({"type": "command_result", **result})
            elif kind == "ping":
                store.touch(session_id)
                sess_live = store.get(session_id)
                await websocket.send_json(
                    {
                        "type": "state",
                        "session": sess_live.public() if sess_live else None,
                    }
                )
            else:
                await websocket.send_json({"type": "error", "error": "unknown type"})
    except WebSocketDisconnect:
        pass
    finally:
        add_gauge("ws_active", -1)


def run() -> None:
    import uvicorn

    host = os.environ.get("KTK_HOST", "0.0.0.0")
    port = int(os.environ.get("KTK_FASTAPI_PORT", "8010"))
    uvicorn.run(
        "backend.api.main:app",
        host=host,
        port=port,
        log_level="info",
    )


if __name__ == "__main__":
    run()
