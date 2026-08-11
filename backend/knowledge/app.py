"""Версионируемая база знаний ЭЛОУ-АВТ с поиском и ролевыми связями."""

from __future__ import annotations

import argparse
import mimetypes
import re
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

from backend.common.http import JsonHandler
from backend.knowledge.catalog import load_articles, load_references, searchable_text

ROOT = Path(__file__).parent
ASSET_DIR = ROOT / "assets"
REFERENCE_DIR = ROOT / "references"
ARTICLES: list[dict] = load_articles()
ARTICLE_BY_ID = {article["id"]: article for article in ARTICLES}
REFERENCE_BY_ID = {item["id"]: item for item in load_references()}


def _tokens(value: str) -> list[str]:
    return re.findall(r"[a-zа-яё0-9-]{2,}", value.casefold())


def list_categories() -> list[dict]:
    counts: dict[str, int] = {}
    for article in ARTICLES:
        category = article["category"]
        counts[category] = counts.get(category, 0) + 1
    return [
        {"name": name, "count": count}
        for name, count in sorted(counts.items(), key=lambda item: item[0])
    ]


def serialize(article: dict, detail: bool = False) -> dict:
    if detail:
        return article
    keys = (
        "id",
        "title",
        "category",
        "summary",
        "keywords",
        "revision",
        "updatedAt",
        "status",
        "roles",
        "equipmentIds",
        "scenarioIds",
    )
    return {key: article[key] for key in keys}


def list_articles(
    query: str = "",
    category: str = "",
    role: str = "",
    equipment: str = "",
) -> list[dict]:
    query_tokens = _tokens(query)
    result: list[tuple[int, dict]] = []
    for article in ARTICLES:
        if category and article["category"] != category:
            continue
        if role and role not in article.get("roles", []):
            continue
        if equipment and equipment not in article.get("equipmentIds", []):
            continue
        searchable = searchable_text(article).casefold()
        if query_tokens and not all(token in searchable for token in query_tokens):
            continue
        title = article["title"].casefold()
        keywords = " ".join(article.get("keywords", [])).casefold()
        score = sum(10 for token in query_tokens if token in title)
        score += sum(5 for token in query_tokens if token in keywords)
        score += sum(searchable.count(token) for token in query_tokens)
        result.append((score, serialize(article)))
    result.sort(key=lambda item: (-item[0], item[1]["category"], item[1]["title"]))
    return [item for _, item in result]


def get_article(article_id: str) -> dict | None:
    article = ARTICLE_BY_ID.get(article_id)
    return serialize(article, detail=True) if article else None


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
                    "database": "versioned-json-catalog",
                }
            )
        if path == "/categories":
            return self.send_json(list_categories())
        if path == "/articles":
            return self.send_json(
                list_articles(
                    (query.get("q") or [""])[0],
                    (query.get("category") or [""])[0],
                    (query.get("role") or [""])[0],
                    (query.get("equipment") or [""])[0],
                )
            )
        if path.startswith("/articles/"):
            article = get_article(unquote(path[len("/articles/") :]))
            if not article:
                return self.send_error_json("article not found", 404)
            return self.send_json(article)
        if path.startswith("/assets/"):
            return self._send_asset(unquote(path[len("/assets/") :]))
        if path.startswith("/references/"):
            return self._send_reference(unquote(path[len("/references/") :]))
        self.send_error_json("not found", 404)

    def _send_asset(self, relative: str) -> None:
        root = ASSET_DIR.resolve()
        target = (root / relative).resolve()
        if root not in target.parents or not target.is_file():
            self.send_error_json("asset not found", 404)
            return
        raw = target.read_bytes()
        self.send_response(200)
        self.send_header(
            "Content-Type",
            mimetypes.guess_type(target.name)[0] or "application/octet-stream",
        )
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "public, max-age=3600")
        self.end_headers()
        self.wfile.write(raw)

    def _send_reference(self, reference_id: str) -> None:
        reference = REFERENCE_BY_ID.get(reference_id)
        if not reference:
            self.send_error_json("reference not found", 404)
            return
        root = REFERENCE_DIR.resolve()
        target = (root / reference["localPath"]).resolve()
        if root not in target.parents or not target.is_file():
            self.send_error_json("reference file not found", 404)
            return
        raw = target.read_bytes()
        self.send_response(200)
        self.send_header(
            "Content-Type",
            mimetypes.guess_type(target.name)[0] or "application/octet-stream",
        )
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Content-Disposition", f'inline; filename="{target.name}"')
        self.send_header("Cache-Control", "private, max-age=3600")
        self.end_headers()
        self.wfile.write(raw)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8104)
    args = parser.parse_args()
    print(f"[knowledge] http://{args.host}:{args.port} ({len(ARTICLES)} articles)")
    ThreadingHTTPServer((args.host, args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
