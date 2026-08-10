from __future__ import annotations

import argparse
import json
import time
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from services.common.http import JsonHandler

CATALOG = json.loads((Path(__file__).parent / "catalog.json").read_text(encoding="utf-8"))


def find_training(training_id: str) -> dict:
    return next(item for item in CATALOG if item["id"] == training_id)


def check_condition(condition: dict, process: dict) -> bool:
    if "all" in condition:
        return all(check_condition(item, process) for item in condition["all"])
    if "any" in condition:
        return any(check_condition(item, process) for item in condition["any"])
    actual = process.get(condition["field"])
    expected = condition.get("value")
    operation = condition.get("op", "eq")
    if operation == "eq":
        return actual == expected
    if actual is None:
        return False
    if operation == "gte":
        return actual >= expected
    if operation == "lte":
        return actual <= expected
    if operation == "gt":
        return actual > expected
    if operation == "lt":
        return actual < expected
    raise ValueError(f"Unsupported condition operation: {operation}")


def evaluate(training_id: str, process: dict, hints_used: int) -> dict:
    training = find_training(training_id)
    checks = [check_condition(condition, process) for condition in training["criteria"]]
    completed_count = sum(checks)
    progress = round(completed_count / len(checks) * 100)
    score = max(0, progress - hints_used * 5)
    return {
        "trainingId": training_id,
        "checks": checks,
        "progressPercent": progress,
        "completed": all(checks),
        "scorePercent": score,
        "hintsUsed": hints_used,
    }


class Handler(JsonHandler):
    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/health":
            return self.send_json({"status": "ok", "service": "training", "count": len(CATALOG)})
        if path == "/trainings":
            return self.send_json(CATALOG)
        self.send_error_json("not found", 404)

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        try:
            body = self.read_json()
            if path == "/start":
                training = find_training(str(body["trainingId"]))
                return self.send_json({"training": training, "startedAt": int(time.time() * 1000)})
            if path == "/evaluate":
                return self.send_json(evaluate(str(body["trainingId"]), body["process"], int(body.get("hintsUsed", 0))))
            self.send_error_json("not found", 404)
        except Exception as exc:
            self.send_error_json(exc)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8103)
    args = parser.parse_args()
    print(f"[training] http://{args.host}:{args.port}")
    ThreadingHTTPServer((args.host, args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
