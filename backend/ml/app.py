from __future__ import annotations

import argparse
from http.server import ThreadingHTTPServer
from urllib.parse import urlparse

from backend.ai.engine import predict_risk
from backend.common.http import JsonHandler
from backend.ml.service import analyze, health, recommend


class Handler(JsonHandler):
    def do_GET(self) -> None:
        if urlparse(self.path).path == "/health":
            return self.send_json(health())
        self.send_error_json("not found", 404)

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        try:
            body = self.read_json()
            if path == "/analyze":
                return self.send_json(analyze(body))
            if path == "/recommend":
                return self.send_json(recommend(body))
            if path == "/risk-preview":
                return self.send_json(predict_risk(body))
            self.send_error_json("not found", 404)
        except ValueError as exc:
            self.send_error_json(exc, 400)
        except Exception as exc:  # noqa: BLE001
            self.send_error_json(exc, 503)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8109)
    args = parser.parse_args()
    print(f"[ml-recommender] http://{args.host}:{args.port}", flush=True)
    ThreadingHTTPServer((args.host, args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
