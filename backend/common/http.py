from __future__ import annotations

import json
import os
from http.server import BaseHTTPRequestHandler
from typing import Any


def _cors_origins() -> set[str]:
    raw = os.environ.get(
        "KTK_CORS_ORIGINS",
        "http://localhost:8080,http://localhost:8081,http://localhost:8082,"
        "http://127.0.0.1:8080,http://127.0.0.1:8081,http://127.0.0.1:8082,"
        "http://localhost:5173,http://localhost:5174,http://localhost:5175",
    )
    return {part.strip() for part in raw.split(",") if part.strip()}


class JsonHandler(BaseHTTPRequestHandler):
    server_version = "KTK/0.1"
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt: str, *args: object) -> None:
        print(f"[{self.log_date_time_string()}] {fmt % args}")

    def _apply_cors(self) -> None:
        origin = (self.headers.get("Origin") or "").strip()
        allowed = _cors_origins()
        if origin and origin in allowed:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Access-Control-Allow-Credentials", "true")
            self.send_header("Vary", "Origin")
        self.send_header(
            "Access-Control-Allow-Headers",
            "Content-Type, Authorization",
        )
        self.send_header(
            "Access-Control-Allow-Methods",
            "GET, POST, PATCH, PUT, DELETE, OPTIONS",
        )

    def end_headers(self) -> None:
        self._apply_cors()
        self.send_header("Connection", "close")
        self.close_connection = True
        super().end_headers()

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.end_headers()

    def read_json(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0"))
        if not length:
            return {}
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def send_json(
        self,
        data: Any,
        status: int = 200,
        extra_headers: dict[str, str] | None = None,
    ) -> None:
        raw = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        if extra_headers:
            for key, value in extra_headers.items():
                self.send_header(key, value)
        self.end_headers()
        self.wfile.write(raw)

    def send_error_json(self, error: Exception | str, status: int = 400) -> None:
        self.send_json({"error": str(error)}, status)
