"""Фоновый серверный такт симуляции."""

from __future__ import annotations

import os
import threading
import time

from backend.common.metrics import inc, set_gauge
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

    def loop() -> None:
        while True:
            t0 = time.perf_counter()
            updated = store.tick_all(interval)
            if updated:
                inc("sim_ticks", len(updated))
            set_gauge("sim_active_sessions", store.active_count())
            set_gauge("last_broadcast_ms", (time.perf_counter() - t0) * 1000)
            time.sleep(interval)

    threading.Thread(target=loop, name="ktk-sim-tick", daemon=True).start()
