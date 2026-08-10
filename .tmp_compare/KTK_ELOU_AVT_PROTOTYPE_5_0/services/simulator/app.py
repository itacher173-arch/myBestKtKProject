from __future__ import annotations

import argparse
import threading
import time
from http.server import ThreadingHTTPServer
from urllib.parse import urlparse

from services.common.http import JsonHandler
from services.simulator.ktk_simulator import CONTROL_META, Model, VERSION
from services.simulator.ktk_simulator.commands import (
    apply_command,
    set_control,
    set_pump,
    set_utility,
    start_session,
)
from services.simulator.ktk_simulator.projection import public_state

model = Model()


def clock() -> None:
    last = time.monotonic()
    while True:
        time.sleep(0.2)
        now = time.monotonic()
        with model.lock:
            if model.running:
                model.step(min(now - last, 1.0) * model.speed)
        last = now


class Handler(JsonHandler):
    def do_GET(self) -> None:
        path = urlparse(self.path).path
        with model.lock:
            if path == "/health":
                return self.send_json({"status": "ok", "service": "simulator", "version": VERSION})
            if path == "/state":
                return self.send_json(public_state(model))
            if path == "/controls":
                return self.send_json(CONTROL_META)
        self.send_error_json("not found", 404)

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        try:
            body = self.read_json()
            with model.lock:
                if path == "/run":
                    model.running = bool(body["running"])
                elif path == "/speed":
                    model.speed = max(0.1, min(20.0, float(body["value"])))
                elif path == "/reset":
                    model.reset(str(body.get("mode", "normal")))
                elif path == "/session/start":
                    start_session(model, body.get("scenarioId"))
                elif path == "/control":
                    set_control(model, str(body["id"]), float(body["value"]))
                elif path == "/utility":
                    set_utility(model, str(body["id"]), body["value"])
                elif path == "/pump":
                    set_pump(model, str(body["id"]), str(body["action"]))
                elif path == "/scenario":
                    scenario_id = str(body["id"])
                    model.active.add(scenario_id) if body.get("active") else model.active.discard(scenario_id)
                elif path == "/command":
                    apply_command(model, body)
                elif path == "/ack":
                    model.alarms[str(body["id"])]["ack"] = True
                elif path == "/step":
                    model.step(float(body.get("seconds", 1)))
                else:
                    return self.send_error_json("not found", 404)
                self.send_json(public_state(model))
        except Exception as exc:
            self.send_error_json(exc)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8101)
    args = parser.parse_args()
    threading.Thread(target=clock, daemon=True).start()
    print(f"[simulator] http://{args.host}:{args.port}")
    ThreadingHTTPServer((args.host, args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
