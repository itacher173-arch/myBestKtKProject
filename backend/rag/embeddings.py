"""Embedding providers для RAG: Ollama и детерминированный offline fallback."""

from __future__ import annotations

import hashlib
import json
import math
import os
import re
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

DEFAULT_DIMENSION = 384


def _tokens(text: str) -> list[str]:
    return re.findall(r"[a-zа-яё0-9-]{2,}", text.casefold())


def hash_embedding(text: str, dimension: int = DEFAULT_DIMENSION) -> list[float]:
    """Стабильный локальный embedding без внешней модели.

    Это fallback для разработки, а не замена семантической embedding-модели.
    """
    vector = [0.0] * dimension
    for token in _tokens(text):
        digest = hashlib.blake2b(token.encode("utf-8"), digest_size=16).digest()
        index = int.from_bytes(digest[:4], "big") % dimension
        sign = 1.0 if digest[4] & 1 else -1.0
        vector[index] += sign
    norm = math.sqrt(sum(value * value for value in vector))
    if norm:
        return [value / norm for value in vector]
    return vector


def ollama_embedding(text: str) -> list[float]:
    base_url = os.getenv("KTK_OLLAMA_URL", "http://ollama:11434").rstrip("/")
    model = os.getenv("KTK_OLLAMA_EMBED_MODEL", "nomic-embed-text")
    body = json.dumps({"model": model, "input": text}, ensure_ascii=False).encode(
        "utf-8"
    )
    request = Request(
        f"{base_url}/api/embed",
        data=body,
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    with urlopen(request, timeout=30) as response:
        payload: dict[str, Any] = json.loads(response.read().decode("utf-8"))
    embeddings = payload.get("embeddings")
    if not isinstance(embeddings, list) or not embeddings:
        raise RuntimeError("Ollama не вернула embeddings")
    vector = embeddings[0]
    if not isinstance(vector, list) or not vector:
        raise RuntimeError("Ollama вернула пустой embedding")
    return [float(value) for value in vector]


def embed_text(text: str) -> tuple[list[float], str]:
    provider = os.getenv("KTK_RAG_EMBEDDING_PROVIDER", "auto").casefold()
    if provider in {"ollama", "auto"}:
        try:
            return ollama_embedding(text), "ollama"
        except (OSError, HTTPError, URLError, ValueError, RuntimeError, TimeoutError):
            if provider == "ollama":
                raise
    return hash_embedding(text), "hash"
