from __future__ import annotations

import argparse
import json
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from services.common.http import JsonHandler

CATALOG = json.loads((Path(__file__).parent / "catalog.json").read_text(encoding="utf-8"))


class Handler(JsonHandler):
    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/health":
            return self.send_json({"status": "ok", "service": "scenarios", "count": len(CATALOG)})
        if path == "/scenarios":
            return self.send_json(CATALOG)
        self.send_error_json("not found", 404)

    def do_POST(self) -> None:
        if urlparse(self.path).path != "/evaluate":
            return self.send_error_json("not found", 404)
        try:
            body = self.read_json()
            scenario = next(item for item in CATALOG if item["id"] == body["scenarioId"])
            actions = body.get("actions", [])
            expected = body.get("expectedActions", [])
            hits = sum(1 for action in expected if action in actions)
            completion = 100 if not expected else round(hits / len(expected) * 100)
            penalty = max(0, len(actions) - hits)
            response = body.get("responseSeconds")
            self.send_json({
                "scenarioId": scenario["id"],
                "scorePercent": max(0, completion - penalty * 2),
                "penalty": penalty,
                "respondedInTime": response is None or float(response) <= scenario["normSeconds"],
            })
        except Exception as exc:
            self.send_error_json(exc)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8102)
    args = parser.parse_args()
    print(f"[scenarios] http://{args.host}:{args.port}")
    ThreadingHTTPServer((args.host, args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
