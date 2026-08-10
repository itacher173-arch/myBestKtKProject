"""Запуск всех сервисов КТК в одном процессе (для разработки)."""

from __future__ import annotations

import argparse
import os
import threading
from http.server import ThreadingHTTPServer

from backend.ai.app import Handler as AiHandler
from backend.auth.app import Handler as AuthHandler
from backend.auth.app import bootstrap as bootstrap_auth
from backend.gateway.app import Handler as GatewayHandler
from backend.knowledge.app import Handler as KnowledgeHandler
from backend.presence import start_presence_server
from backend.simulator.ticker import start_ticker
from backend.storage.app import RUNTIME
from backend.storage.app import Handler as StorageHandler
from backend.storage.app import bootstrap as bootstrap_storage
from backend.training.app import Handler as TrainingHandler


def _serve(name: str, host: str, port: int, handler) -> None:
    print(f"[{name}] http://{host}:{port}", flush=True)

    class Server(ThreadingHTTPServer):
        allow_reuse_address = True

    Server((host, port), handler).serve_forever()


def _serve_fastapi(host: str, port: int) -> None:
    import uvicorn

    print(f"[fastapi] http://{host}:{port}", flush=True)
    uvicorn.run(
        "backend.api.main:app",
        host=host,
        port=port,
        log_level="info",
        access_log=False,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="КТК backend (AVT-style)")
    parser.add_argument("--host", default=os.environ.get("KTK_HOST", "127.0.0.1"))
    parser.add_argument("--gateway-port", type=int, default=8000)
    parser.add_argument("--auth-port", type=int, default=8102)
    parser.add_argument("--training-port", type=int, default=8103)
    parser.add_argument("--knowledge-port", type=int, default=8104)
    parser.add_argument("--storage-port", type=int, default=8105)
    parser.add_argument("--presence-port", type=int, default=8106)
    parser.add_argument("--ai-port", type=int, default=8107)
    parser.add_argument(
        "--fastapi-port",
        type=int,
        default=int(os.environ.get("KTK_FASTAPI_PORT", "8010")),
    )
    args = parser.parse_args()

    RUNTIME.mkdir(parents=True, exist_ok=True)
    bootstrap_auth()
    bootstrap_storage()
    start_ticker()
    start_presence_server(args.host if args.host != "127.0.0.1" else "0.0.0.0", args.presence_port)

    workers = [
        ("auth", args.auth_port, AuthHandler),
        ("training", args.training_port, TrainingHandler),
        ("knowledge", args.knowledge_port, KnowledgeHandler),
        ("storage", args.storage_port, StorageHandler),
        ("ai", args.ai_port, AiHandler),
        ("gateway", args.gateway_port, GatewayHandler),
    ]
    threads = []
    for name, port, handler in workers:
        thread = threading.Thread(
            target=_serve,
            args=(name, args.host, port, handler),
            name=f"ktk-{name}",
            daemon=True,
        )
        thread.start()
        threads.append(thread)

    fastapi_host = args.host if args.host != "127.0.0.1" else "0.0.0.0"
    threads.append(
        threading.Thread(
            target=_serve_fastapi,
            args=(fastapi_host, args.fastapi_port),
            name="ktk-fastapi",
            daemon=True,
        )
    )
    threads[-1].start()

    print(
        f"[ktk] API http://{args.host}:{args.gateway_port}/api/health · "
        f"FastAPI :{args.fastapi_port} · WS :{args.presence_port}/ · "
        f"AI :{args.ai_port} · данные → PostgreSQL + Redis · серверный такт симуляции",
        flush=True,
    )
    for thread in threads:
        thread.join()


if __name__ == "__main__":
    main()
