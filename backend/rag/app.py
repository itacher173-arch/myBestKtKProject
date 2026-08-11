from __future__ import annotations

import argparse
import time
from http.server import ThreadingHTTPServer
from urllib.parse import urlparse

from backend.common.http import JsonHandler
from backend.rag.service import ensure_index, health, search


class Handler(JsonHandler):
    def do_GET(self) -> None:
        if urlparse(self.path).path == "/health":
            return self.send_json(health())
        self.send_error_json("not found", 404)

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        try:
            body = self.read_json()
            if path == "/search":
                return self.send_json(
                    search(
                        str(body.get("query") or ""),
                        filters=body.get("filters"),
                        limit=int(body.get("limit") or 6),
                    )
                )
            if path == "/reindex":
                return self.send_json(
                    ensure_index(force=bool(body.get("force"))),
                    201,
                )
            self.send_error_json("not found", 404)
        except ValueError as exc:
            self.send_error_json(exc, 400)
        except Exception as exc:  # noqa: BLE001
            self.send_error_json(exc, 503)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8108)
    parser.add_argument("--index-on-start", action="store_true")
    args = parser.parse_args()
    if args.index_on_start:
        for attempt in range(1, 11):
            try:
                print(f"[rag] index: {ensure_index()}", flush=True)
                break
            except Exception as exc:  # noqa: BLE001
                print(
                    f"[rag] index attempt {attempt}/10 failed: {exc}",
                    flush=True,
                )
                if attempt < 10:
                    time.sleep(2)
        else:
            print("[rag] using lexical fallback", flush=True)
    print(f"[rag] http://{args.host}:{args.port}", flush=True)
    ThreadingHTTPServer((args.host, args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
