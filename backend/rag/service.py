"""Индексирование и поиск по версионируемой базе знаний."""

from __future__ import annotations

import hashlib
import json
import os
import re
import uuid
from dataclasses import dataclass
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from backend.knowledge.catalog import flatten_article, load_articles
from backend.rag.embeddings import embed_text

COLLECTION = os.getenv("KTK_RAG_COLLECTION", "ktk_knowledge")
QDRANT_URL = os.getenv("KTK_QDRANT_URL", "http://qdrant:6333").rstrip("/")
INDEX_VERSION = os.getenv("KTK_KNOWLEDGE_INDEX_VERSION", "knowledge-v1")
CHUNK_MAX_CHARS = int(os.getenv("KTK_RAG_CHUNK_MAX_CHARS", "1200"))


@dataclass(frozen=True)
class KnowledgeChunk:
    id: str
    text: str
    payload: dict[str, Any]


def _request_json(
    method: str,
    url: str,
    payload: dict[str, Any] | None = None,
    *,
    timeout: float = 10,
) -> dict[str, Any]:
    body = (
        json.dumps(payload, ensure_ascii=False).encode("utf-8")
        if payload is not None
        else None
    )
    request = Request(
        url,
        data=body,
        method=method,
        headers={"Content-Type": "application/json"},
    )
    with urlopen(request, timeout=timeout) as response:
        raw = response.read()
    return json.loads(raw.decode("utf-8")) if raw else {}


def _chunk_paragraphs(paragraphs: list[str]) -> list[str]:
    chunks: list[str] = []
    current: list[str] = []
    size = 0
    for paragraph in paragraphs:
        item = str(paragraph).strip()
        if not item:
            continue
        if current and size + len(item) + 2 > CHUNK_MAX_CHARS:
            chunks.append("\n\n".join(current))
            current = []
            size = 0
        current.append(item)
        size += len(item) + 2
    if current:
        chunks.append("\n\n".join(current))
    return chunks


def knowledge_chunks() -> list[KnowledgeChunk]:
    chunks: list[KnowledgeChunk] = []
    for article in load_articles():
        paragraphs = [
            article.get("title", ""),
            article.get("summary", ""),
            *flatten_article(article),
        ]
        for index, text in enumerate(_chunk_paragraphs(paragraphs)):
            chunk_id = f"{article['id']}:{article.get('revision', '1.0')}:{index}"
            chunks.append(
                KnowledgeChunk(
                    id=str(uuid.uuid5(uuid.NAMESPACE_URL, f"ktk:{chunk_id}")),
                    text=text,
                    payload={
                        "articleId": article["id"],
                        "chunkId": chunk_id,
                        "title": article.get("title", ""),
                        "category": article.get("category", ""),
                        "revision": article.get("revision", "1.0"),
                        "status": article.get("status", ""),
                        "roles": article.get("roles", []),
                        "equipmentIds": article.get("equipmentIds", []),
                        "scenarioIds": article.get("scenarioIds", []),
                        "learningObjectives": article.get("learningObjectives", []),
                        "text": text,
                        "indexVersion": INDEX_VERSION,
                    },
                )
            )
    return chunks


def _collection_dimension() -> int | None:
    try:
        response = _request_json("GET", f"{QDRANT_URL}/collections/{COLLECTION}")
        return int(
            response["result"]["config"]["params"]["vectors"]["size"]
        )
    except (KeyError, TypeError, ValueError, HTTPError, URLError, TimeoutError):
        return None


def ensure_index(*, force: bool = False) -> dict[str, Any]:
    chunks = knowledge_chunks()
    if not chunks:
        return {"ok": False, "error": "База знаний пуста", "indexed": 0}

    first_vector, provider = embed_text(chunks[0].text)
    dimension = len(first_vector)
    existing_dimension = _collection_dimension()
    if force or existing_dimension != dimension:
        try:
            _request_json("DELETE", f"{QDRANT_URL}/collections/{COLLECTION}")
        except (HTTPError, URLError, TimeoutError):
            pass
        _request_json(
            "PUT",
            f"{QDRANT_URL}/collections/{COLLECTION}",
            {"vectors": {"size": dimension, "distance": "Cosine"}},
        )

    points: list[dict[str, Any]] = []
    for index, chunk in enumerate(chunks):
        if index == 0:
            vector = first_vector
        else:
            vector, point_provider = embed_text(chunk.text)
            if point_provider != provider:
                raise RuntimeError(
                    "Embedding provider изменился во время индексирования"
                )
        points.append(
            {
                "id": chunk.id,
                "vector": vector,
                "payload": {**chunk.payload, "embeddingProvider": provider},
            }
        )
        if len(points) >= 64:
            _request_json(
                "PUT",
                f"{QDRANT_URL}/collections/{COLLECTION}/points?wait=true",
                {"points": points},
                timeout=60,
            )
            points = []
    if points:
        _request_json(
            "PUT",
            f"{QDRANT_URL}/collections/{COLLECTION}/points?wait=true",
            {"points": points},
            timeout=60,
        )

    fingerprint = hashlib.sha256(
        "\n".join(f"{item.id}:{item.text}" for item in chunks).encode("utf-8")
    ).hexdigest()
    return {
        "ok": True,
        "indexed": len(chunks),
        "collection": COLLECTION,
        "dimension": dimension,
        "embeddingProvider": provider,
        "indexVersion": INDEX_VERSION,
        "fingerprint": fingerprint,
    }


def _filters_match(payload: dict[str, Any], filters: dict[str, Any]) -> bool:
    for key in ("articleId", "category", "status"):
        expected = filters.get(key)
        if expected and payload.get(key) != expected:
            return False
    for key in ("equipmentIds", "scenarioIds", "roles"):
        expected = filters.get(key)
        if expected:
            values = set(str(item) for item in payload.get(key, []))
            requested = (
                {str(item) for item in expected}
                if isinstance(expected, list)
                else {str(expected)}
            )
            if not values.intersection(requested):
                return False
    return True


def _tokens(text: str) -> set[str]:
    return set(re.findall(r"[a-zа-яё0-9-]{2,}", text.casefold()))


def lexical_search(
    query: str, filters: dict[str, Any], limit: int
) -> list[dict[str, Any]]:
    query_tokens = _tokens(query)
    scored: list[tuple[float, KnowledgeChunk]] = []
    for chunk in knowledge_chunks():
        if not _filters_match(chunk.payload, filters):
            continue
        title_tokens = _tokens(str(chunk.payload.get("title", "")))
        text_tokens = _tokens(chunk.text)
        score = len(query_tokens & title_tokens) * 4 + len(query_tokens & text_tokens)
        if score:
            scored.append((float(score), chunk))
    scored.sort(key=lambda item: (-item[0], item[1].id))
    return [
        {
            "score": score,
            "text": chunk.text,
            **chunk.payload,
        }
        for score, chunk in scored[:limit]
    ]


def vector_search(
    query: str, filters: dict[str, Any], limit: int
) -> tuple[list[dict[str, Any]], str]:
    vector, provider = embed_text(query)
    payload = _request_json(
        "POST",
        f"{QDRANT_URL}/collections/{COLLECTION}/points/search",
        {
            "vector": vector,
            "limit": max(limit * 2, limit),
            "with_payload": True,
        },
    )
    results: list[dict[str, Any]] = []
    for item in payload.get("result", []):
        point_payload = item.get("payload") or {}
        if point_payload.get("embeddingProvider") != provider:
            continue
        if not _filters_match(point_payload, filters):
            continue
        results.append(
            {
                "score": float(item.get("score") or 0),
                **point_payload,
            }
        )
        if len(results) >= limit:
            break
    return results, provider


def search(
    query: str,
    *,
    filters: dict[str, Any] | None = None,
    limit: int = 6,
) -> dict[str, Any]:
    clean_query = query.strip()
    if not clean_query:
        raise ValueError("query обязателен")
    safe_limit = max(1, min(int(limit), 12))
    safe_filters = filters if isinstance(filters, dict) else {}
    try:
        results, provider = vector_search(clean_query, safe_filters, safe_limit)
        if results:
            return {
                "ok": True,
                "mode": "vector",
                "embeddingProvider": provider,
                "indexVersion": INDEX_VERSION,
                "results": results,
            }
    except (HTTPError, URLError, TimeoutError, ValueError, RuntimeError):
        pass
    return {
        "ok": True,
        "mode": "lexical-fallback",
        "embeddingProvider": None,
        "indexVersion": INDEX_VERSION,
        "results": lexical_search(clean_query, safe_filters, safe_limit),
    }


def health() -> dict[str, Any]:
    try:
        payload = _request_json("GET", f"{QDRANT_URL}/collections/{COLLECTION}")
        points = payload.get("result", {}).get("points_count")
        qdrant = {"status": "ok", "points": points}
    except (HTTPError, URLError, TimeoutError, ValueError):
        qdrant = {"status": "unavailable"}
    return {
        "status": "ok",
        "service": "rag",
        "collection": COLLECTION,
        "indexVersion": INDEX_VERSION,
        "qdrant": qdrant,
        "fallback": "lexical",
    }
