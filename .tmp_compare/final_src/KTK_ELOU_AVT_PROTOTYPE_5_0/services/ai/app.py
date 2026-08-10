from __future__ import annotations

import argparse
import os
from http.server import ThreadingHTTPServer
from urllib.parse import urlparse

from services.ai.engine import analyze_session, answer_question
from services.common.http import JsonHandler


class Handler(JsonHandler):
    def do_GET(self) -> None:
        if urlparse(self.path).path == "/health":
            return self.send_json(
                {
                    "status": "ok",
                    "service": "ai",
                    "enabled": os.getenv("KTK_AI_ENABLED", "true").casefold() != "false",
                    "provider": os.getenv("KTK_AI_PROVIDER", "rules"),
                    "externalRequests": False,
                }
            )
        self.send_error_json("not found", 404)

    def do_POST(self) -> None:
        if os.getenv("KTK_AI_ENABLED", "true").casefold() == "false":
            return self.send_error_json("AI-модуль отключён администратором", 503)
        path = urlparse(self.path).path
        try:
            body = self.read_json()
            if path == "/analyze":
                return self.send_json(analyze_session(body))
            if path == "/chat":
                return self.send_json(answer_question(body))
            self.send_error_json("not found", 404)
        except Exception as exc:
            self.send_error_json(exc)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8106)
    args = parser.parse_args()
    print(f"[ai] http://{args.host}:{args.port}")
    ThreadingHTTPServer((args.host, args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
