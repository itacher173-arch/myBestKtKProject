"""База знаний: JSON seed в памяти (без SQLite)."""

from __future__ import annotations

import argparse
import json
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

from backend.common.http import JsonHandler

ROOT = Path(__file__).resolve().parents[2]
SEED_PATH = ROOT / "frontend" / "src" / "knowledge" / "seed.json"

ARTICLES: list[dict] = json.loads(SEED_PATH.read_text(encoding="utf-8"))


def list_categories() -> list[dict]:
    counts: dict[str, int] = {}
    for article in ARTICLES:
        cat = article.get("category", "")
        counts[cat] = counts.get(cat, 0) + 1
    return [
        {"name": name, "count": count}
        for name, count in sorted(counts.items(), key=lambda item: item[0])
    ]


def serialize(article: dict, detail: bool = False) -> dict:
    result = {
        "id": article["id"],
        "title": article["title"],
        "category": article["category"],
        "summary": article["summary"],
        "source": article.get("source", ""),
        "keywords": article.get("keywords", []),
    }
    if detail:
        result["content"] = article.get("content", [])
    return result


def list_articles(query: str = "", category: str = "") -> list[dict]:
    normalized = query.casefold().strip()
    result = []
    for article in ARTICLES:
        if category and article.get("category") != category:
            continue
        if normalized:
            hay = " ".join(
                [
                    article.get("title", ""),
                    article.get("summary", ""),
                    article.get("source", ""),
                    " ".join(article.get("keywords", [])),
                    " ".join(article.get("content", [])),
                ]
            ).casefold()
            if normalized not in hay:
                continue
        result.append(serialize(article))
    return result


def get_article(article_id: str) -> dict | None:
    for article in ARTICLES:
        if article.get("id") == article_id:
            return serialize(article, detail=True)
    return None


class Handler(JsonHandler):
    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)
        if path == "/health":
            return self.send_json(
                {
                    "status": "ok",
                    "service": "knowledge",
                    "count": len(ARTICLES),
                    "database": "json-seed",
                }
            )
        if path == "/categories":
            return self.send_json(list_categories())
        if path == "/articles":
            q = (query.get("q") or [""])[0]
            category = (query.get("category") or [""])[0]
            return self.send_json(list_articles(q, category))
        if path.startswith("/articles/"):
            article_id = unquote(path[len("/articles/") :])
            article = get_article(article_id)
            if not article:
                return self.send_error_json("article not found", 404)
            return self.send_json(article)
        self.send_error_json("not found", 404)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8104)
    args = parser.parse_args()
    print(f"[knowledge] http://{args.host}:{args.port} ({len(ARTICLES)} articles)")
    ThreadingHTTPServer((args.host, args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
