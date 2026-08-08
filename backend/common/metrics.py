"""Простые процессные метрики для наблюдаемости."""

from __future__ import annotations

import os
import threading
import time
from typing import Any

_lock = threading.Lock()
_started = time.time()
_counters: dict[str, int] = {
    "http_requests": 0,
    "ws_connections": 0,
    "ws_events": 0,
    "sim_ticks": 0,
    "sim_sessions": 0,
    "sim_commands": 0,
    "sim_rejected": 0,
}
_gauges: dict[str, float] = {
    "ws_active": 0,
    "sim_active_sessions": 0,
    "last_broadcast_ms": 0,
}


def inc(name: str, n: int = 1) -> None:
    with _lock:
        _counters[name] = int(_counters.get(name, 0)) + n


def set_gauge(name: str, value: float) -> None:
    with _lock:
        _gauges[name] = float(value)


def add_gauge(name: str, delta: float) -> None:
    with _lock:
        _gauges[name] = float(_gauges.get(name, 0)) + delta


def snapshot() -> dict[str, Any]:
    with _lock:
        counters = dict(_counters)
        gauges = dict(_gauges)
    try:
        import resource

        usage = resource.getrusage(resource.RUSAGE_SELF)
        rss_mb = usage.ru_maxrss / 1024 / 1024
        # macOS ru_maxrss в байтах, Linux — в КБ
        if os.uname().sysname == "Darwin":
            rss_mb = usage.ru_maxrss / 1024 / 1024
        else:
            rss_mb = usage.ru_maxrss / 1024
    except Exception:
        rss_mb = None
    return {
        "service": "ktk",
        "uptimeSec": int(time.time() - _started),
        "counters": counters,
        "gauges": gauges,
        "process": {"rssMb": rss_mb},
    }
