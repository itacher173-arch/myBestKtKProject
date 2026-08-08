"""Запуск всех сервисов КТК в одном процессе (для разработки)."""

from __future__ import annotations

import argparse
import os
import threading
from http.server import ThreadingHTTPServer

from backend.gateway.app import Handler as GatewayHandler
from backend.knowledge.app import Handler as KnowledgeHandler
from backend.presence import start_presence_server
from backend.storage.app import Handler as StorageHandler
from backend.storage.app import RUNTIME, bootstrap as bootstrap_storage
from backend.training.app import Handler as TrainingHandler


def _serve(name: str, host: str, port: int, handler) -> None:
    print(f"[{name}] http://{host}:{port}", flush=True)

    class Server(ThreadingHTTPServer):
        allow_reuse_address = True

    Server((host, port), handler).serve_forever()


def main() -> None:
    parser = argparse.ArgumentParser(description="КТК backend (AVT-style)")
    parser.add_argument("--host", default=os.environ.get("KTK_HOST", "127.0.0.1"))
    parser.add_argument("--gateway-port", type=int, default=8000)
    parser.add_argument("--training-port", type=int, default=8103)
    parser.add_argument("--knowledge-port", type=int, default=8104)
    parser.add_argument("--storage-port", type=int, default=8105)
    parser.add_argument("--presence-port", type=int, default=8106)
    args = parser.parse_args()

    RUNTIME.mkdir(parents=True, exist_ok=True)
    bootstrap_storage()
    start_presence_server(args.host if args.host != "127.0.0.1" else "0.0.0.0", args.presence_port)

    workers = [
        ("training", args.training_port, TrainingHandler),
        ("knowledge", args.knowledge_port, KnowledgeHandler),
        ("storage", args.storage_port, StorageHandler),
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

    print(
        f"[ktk] API http://{args.host}:{args.gateway_port}/api/health · "
        f"WS :{args.presence_port}/ · данные → PostgreSQL + Redis",
        flush=True,
    )
    for thread in threads:
        thread.join()


if __name__ == "__main__":
    main()
