"""API-шлюз: прокси к сервисам + раздача собранного UI."""

from __future__ import annotations

import argparse
import json
import mimetypes
import os
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from backend.common.http import JsonHandler

ROOT = Path(__file__).resolve().parents[2]
FRONTEND_DIST = ROOT / "frontend" / "dist"
TRAINING_URL = os.getenv("KTK_TRAINING_URL", "http://127.0.0.1:8103")
KNOWLEDGE_URL = os.getenv("KTK_KNOWLEDGE_URL", "http://127.0.0.1:8104")
STORAGE_URL = os.getenv("KTK_STORAGE_URL", "http://127.0.0.1:8105")


def fetch_json(url: str) -> object:
    with urlopen(url, timeout=2) as response:
        return json.loads(response.read().decode("utf-8"))


class Handler(JsonHandler):
    def proxy(self, base: str, target_path: str) -> None:
        body = None
        if self.command in ("POST", "PUT", "PATCH", "DELETE"):
            length = int(self.headers.get("Content-Length", "0"))
            body = self.rfile.read(length) if length else (
                b"{}" if self.command == "POST" else None
            )
        headers = {"Content-Type": "application/json"} if body is not None else {}
        request = Request(
            base + target_path,
            data=body,
            method=self.command,
            headers=headers,
        )
        try:
            with urlopen(request, timeout=5) as response:
                raw = response.read()
                self.send_response(response.status)
                self.send_header(
                    "Content-Type",
                    response.headers.get("Content-Type", "application/json"),
                )
                self.send_header("Content-Length", str(len(raw)))
                self.end_headers()
                self.wfile.write(raw)
        except HTTPError as exc:
            payload = exc.read().decode("utf-8")
            try:
                self.send_json(json.loads(payload), exc.code)
            except Exception:
                self.send_error_json(payload or str(exc), exc.code)
        except URLError as exc:
            self.send_error_json(f"Сервис недоступен: {exc.reason}", 503)

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/api/health":
            services = {}
            for name, url in (
                ("training", TRAINING_URL),
                ("knowledge", KNOWLEDGE_URL),
                ("storage", STORAGE_URL),
            ):
                try:
                    services[name] = fetch_json(url + "/health")
                except Exception as exc:
                    services[name] = {"status": "error", "error": str(exc)}
            status = (
                "ok"
                if all(item.get("status") == "ok" for item in services.values())
                else "degraded"
            )
            return self.send_json(
                {"status": status, "service": "gateway", "services": services}
            )
        if path == "/api/mini-trainings":
            return self.proxy(TRAINING_URL, "/trainings")
        if path.startswith("/api/knowledge/"):
            return self.proxy(KNOWLEDGE_URL, self.path[len("/api/knowledge") :])
        if path.startswith("/api/knowledge"):
            return self.proxy(KNOWLEDGE_URL, self.path[len("/api/knowledge") :] or "/")
        if path == "/api/reports" or path.startswith("/api/reports/"):
            return self.proxy(STORAGE_URL, path[len("/api") :])
        if path == "/api/audit":
            return self.proxy(STORAGE_URL, "/audit")
        if path.startswith("/api/"):
            return self.send_error_json("not found", 404)
        self.serve_static(path)

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        if path.startswith("/api/training/"):
            return self.proxy(TRAINING_URL, path[len("/api/training") :])
        if path == "/api/reports":
            return self.proxy(STORAGE_URL, "/reports")
        if path == "/api/audit":
            return self.proxy(STORAGE_URL, "/audit")
        self.send_error_json("not found", 404)

    def do_DELETE(self) -> None:
        path = urlparse(self.path).path
        if path == "/api/reports" or path.startswith("/api/reports/"):
            return self.proxy(STORAGE_URL, path[len("/api") :])
        if path == "/api/audit":
            return self.proxy(STORAGE_URL, "/audit")
        self.send_error_json("not found", 404)

    def serve_static(self, path: str) -> None:
        root = FRONTEND_DIST.resolve()
        relative = "index.html" if path == "/" else path.lstrip("/")
        target = (root / relative).resolve()
        if root not in target.parents and target != root / "index.html":
            if not str(target).startswith(str(root)):
                target = root / "index.html"
        if not target.is_file():
            target = root / "index.html"
        if not target.is_file():
            return self.send_json(
                {"error": "Frontend не собран. Выполните npm run build."},
                404,
            )
        raw = target.read_bytes()
        self.send_response(200)
        self.send_header(
            "Content-Type",
            mimetypes.guess_type(target.name)[0] or "application/octet-stream",
        )
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    print(f"[gateway] http://{args.host}:{args.port}")
    ThreadingHTTPServer((args.host, args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
