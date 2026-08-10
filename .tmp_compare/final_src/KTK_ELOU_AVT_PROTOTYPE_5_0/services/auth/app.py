from __future__ import annotations

import argparse
from http.server import ThreadingHTTPServer
from urllib.parse import urlparse

from services.auth.security import authenticate, issue_token, public_user, verify_token
from services.common.http import JsonHandler


def bearer(headers) -> str:
    value = headers.get("Authorization", "")
    return value[7:].strip() if value.lower().startswith("bearer ") else ""


class Handler(JsonHandler):
    def do_GET(self) -> None:
        if urlparse(self.path).path == "/health":
            return self.send_json({"status": "ok", "service": "auth", "mode": "local-signed-token"})
        self.send_error_json("not found", 404)

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        try:
            body = self.read_json()
            if path == "/login":
                user = authenticate(str(body.get("username", "")), str(body.get("password", "")))
                if not user:
                    return self.send_error_json("Неверное имя пользователя или пароль", 401)
                token, expires_at = issue_token(user)
                return self.send_json(
                    {"token": token, "expiresAt": expires_at, "user": public_user(user)}
                )
            if path == "/verify":
                token = bearer(self.headers) or str(body.get("token", ""))
                payload = verify_token(token)
                return self.send_json(
                    {
                        "valid": True,
                        "user": {
                            "username": payload["sub"],
                            "displayName": payload["name"],
                            "role": payload["role"],
                            "position": payload["position"],
                        },
                    }
                )
            if path == "/logout":
                return self.send_json({"ok": True})
            self.send_error_json("not found", 404)
        except ValueError as exc:
            self.send_error_json(exc, 401)
        except Exception as exc:
            self.send_error_json(exc)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8105)
    args = parser.parse_args()
    print(f"[auth] http://{args.host}:{args.port}")
    ThreadingHTTPServer((args.host, args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
