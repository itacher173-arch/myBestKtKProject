"""Фоновый серверный такт симуляции."""

from __future__ import annotations

import os
import threading
import time

from backend.common.metrics import inc, set_gauge
from backend.simulator.checkpoint_store import save_session
from backend.simulator.session import store

_started = False
_lock = threading.Lock()


def start_ticker(dt: float | None = None) -> None:
    global _started
    with _lock:
        if _started:
            return
        _started = True

    interval = dt if dt is not None else float(os.environ.get("KTK_SIM_TICK_SEC", "0.25"))
    checkpoint_interval = float(
        os.environ.get("KTK_SIM_CHECKPOINT_INTERVAL_SEC", "5")
    )
    disconnect_timeout = float(
        os.environ.get("KTK_SIM_DISCONNECT_TIMEOUT_SEC", "30")
    )

    def loop() -> None:
        last_checkpoint = time.monotonic()
        while True:
            t0 = time.perf_counter()
            updated = store.tick_all(interval)
            stale = store.pause_stale(disconnect_timeout)
            if updated:
                inc("sim_ticks", len(updated))
            if stale:
                inc("sim_auto_pauses", len(stale))
            if time.monotonic() - last_checkpoint >= checkpoint_interval:
                try:
                    sessions = {session.id: session for session in [*updated, *stale]}
                    for session in sessions.values():
                        save_session(session.checkpoint())
                except Exception:
                    # Redis may be temporarily unavailable; the ticker must keep running.
                    inc("sim_checkpoint_errors")
                last_checkpoint = time.monotonic()
            set_gauge("sim_active_sessions", store.active_count())
            set_gauge("last_broadcast_ms", (time.perf_counter() - t0) * 1000)
            time.sleep(interval)

    threading.Thread(target=loop, name="ktk-sim-tick", daemon=True).start()
