from __future__ import annotations

import argparse
import json
import sqlite3
from contextlib import contextmanager
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

from services.common.http import JsonHandler

ROOT = Path(__file__).parent
DATA_DIR = ROOT / "data"
DB_PATH = DATA_DIR / "ktk_knowledge.db"
SEED_PATH = ROOT / "seed.json"


def connect() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


@contextmanager
def open_database():
    """Открывает SQLite и гарантированно освобождает файл, включая Windows."""
    database = connect()
    try:
        yield database
        database.commit()
    finally:
        database.close()


def initialize() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    seed = json.loads(SEED_PATH.read_text(encoding="utf-8"))
    with open_database() as database:
        database.execute(
            """
            CREATE TABLE IF NOT EXISTS articles (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                category TEXT NOT NULL,
                summary TEXT NOT NULL,
                content_json TEXT NOT NULL,
                source TEXT NOT NULL,
                keywords_json TEXT NOT NULL
            )
            """
        )
        database.executemany(
            """
            INSERT INTO articles(id, title, category, summary, content_json, source, keywords_json)
            VALUES(:id, :title, :category, :summary, :content_json, :source, :keywords_json)
            ON CONFLICT(id) DO UPDATE SET
                title=excluded.title,
                category=excluded.category,
                summary=excluded.summary,
                content_json=excluded.content_json,
                source=excluded.source,
                keywords_json=excluded.keywords_json
            """,
            [
                {
                    **article,
                    "content_json": json.dumps(article["content"], ensure_ascii=False),
                    "keywords_json": json.dumps(article["keywords"], ensure_ascii=False),
                }
                for article in seed
            ],
        )


def serialize(row: sqlite3.Row, detail: bool = False) -> dict:
    result = {
        "id": row["id"],
        "title": row["title"],
        "category": row["category"],
        "summary": row["summary"],
        "source": row["source"],
        "keywords": json.loads(row["keywords_json"]),
    }
    if detail:
        result["content"] = json.loads(row["content_json"])
    return result


def list_articles(query: str = "", category: str = "") -> list[dict]:
    with open_database() as database:
        rows = database.execute("SELECT * FROM articles ORDER BY category, title").fetchall()
    normalized = query.casefold().strip()
    result = []
    for row in rows:
        if category and row["category"] != category:
            continue
        searchable = " ".join(
            [row["title"], row["summary"], row["source"], row["keywords_json"], row["content_json"]]
        ).casefold()
        if normalized and normalized not in searchable:
            continue
        result.append(serialize(row))
    return result


class Handler(JsonHandler):
    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        if path == "/health":
            with open_database() as database:
                count = database.execute("SELECT COUNT(*) FROM articles").fetchone()[0]
            return self.send_json({"status": "ok", "service": "knowledge", "count": count, "database": "SQLite"})
        if path == "/categories":
            with open_database() as database:
                rows = database.execute(
                    "SELECT category, COUNT(*) AS count FROM articles GROUP BY category ORDER BY category"
                ).fetchall()
            return self.send_json([{"name": row["category"], "count": row["count"]} for row in rows])
        if path == "/articles":
            query = parse_qs(parsed.query)
            return self.send_json(
                list_articles(query.get("q", [""])[0], query.get("category", [""])[0])
            )
        if path.startswith("/articles/"):
            article_id = unquote(path[len("/articles/"):])
            with open_database() as database:
                row = database.execute("SELECT * FROM articles WHERE id = ?", (article_id,)).fetchone()
            if not row:
                return self.send_error_json("article not found", 404)
            return self.send_json(serialize(row, detail=True))
        self.send_error_json("not found", 404)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8104)
    args = parser.parse_args()
    initialize()
    print(f"[knowledge] http://{args.host}:{args.port} · {DB_PATH}")
    ThreadingHTTPServer((args.host, args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
