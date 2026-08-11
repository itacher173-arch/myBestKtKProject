from __future__ import annotations

from backend.ml.service import rank_modules
from backend.rag.embeddings import hash_embedding
from backend.rag.service import knowledge_chunks, lexical_search, search


def test_hash_embedding_is_stable_and_normalized():
    first = hash_embedding("давление колонны К-1")
    second = hash_embedding("давление колонны К-1")
    assert first == second
    assert len(first) == 384
    assert 0.99 <= sum(value * value for value in first) <= 1.01


def test_knowledge_is_split_into_versioned_chunks():
    chunks = knowledge_chunks()
    assert chunks
    assert all(item.payload["articleId"] for item in chunks)
    assert all(item.payload["chunkId"] for item in chunks)
    assert all(item.payload["indexVersion"] for item in chunks)


def test_rag_has_lexical_fallback_without_qdrant(monkeypatch):
    monkeypatch.setenv("KTK_RAG_EMBEDDING_PROVIDER", "hash")
    result = search("снижение давления К-1", limit=3)
    assert result["results"]
    assert result["results"][0]["articleId"] == "k1-control"
    assert result["mode"] in {"vector", "lexical-fallback"}


def test_lexical_search_honors_metadata_filter():
    result = lexical_search(
        "аварийная безопасность вентиляция",
        {"category": "Промышленная безопасность"},
        5,
    )
    assert all(item["category"] == "Промышленная безопасность" for item in result)


def test_recommender_ranks_eligible_module():
    analysis = {
        "localizedErrors": [
            {
                "severity": "critical",
                "classification": {
                    "label": "ML-CRITICAL_OPERATION_ERROR",
                    "confidence": 0.95,
                },
            }
        ],
        "recommendations": [
            {"trainingId": "MT-SAFE-01"},
            {"trainingId": "MT-UTIL-01"},
        ],
    }
    ranking = rank_modules(
        analysis,
        {
            "previousAttempts": [
                {"exerciseId": "MT-K1-01", "scorePercent": 90}
            ]
        },
    )
    assert ranking
    assert ranking[0]["eligible"] is True
    assert ranking[0]["moduleId"] in {"MT-SAFE-01", "MT-UTIL-01", "MT-VENT-01"}
