from __future__ import annotations

from backend.ai import orchestrator
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
    assert "k1-control" in {
        item["articleId"] for item in result["results"]
    }
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


def test_chat_handles_greeting_without_rag(monkeypatch):
    monkeypatch.setenv("KTK_AI_PROVIDER", "rules")
    monkeypatch.setattr(
        orchestrator,
        "_rag",
        lambda *args, **kwargs: (_ for _ in ()).throw(
            AssertionError("RAG не должен вызываться для приветствия")
        ),
    )
    result = orchestrator.answer_question(
        {"message": "Привет! Как дела?", "context": {}}
    )
    assert result["intent"] == "conversation"
    assert result["mode"] == "local-conversation-fallback"
    assert "Привет" in result["answer"]
    assert result["sources"] == []
    assert result["relatedTrainings"] == []


def test_general_chat_uses_base_llm_with_history(monkeypatch):
    captured = {}

    def fake_chat(**kwargs):
        captured.update(kwargs)
        return "Конечно, давайте разберёмся."

    monkeypatch.setattr(orchestrator, "_local_llm_chat", fake_chat)
    result = orchestrator.answer_question(
        {
            "message": "Можешь объяснить проще?",
            "context": {
                "conversationHistory": [
                    {"role": "user", "content": "Расскажи коротко"},
                    {"role": "assistant", "content": "Хорошо."},
                ]
            },
        }
    )
    assert result["intent"] == "conversation"
    assert result["mode"] == "local-llama-cpp-conversation"
    assert captured["history"][-1]["role"] == "assistant"


def test_local_llm_uses_openai_compatible_endpoint(monkeypatch):
    captured = {}

    def fake_post(url, payload, *, timeout):
        captured.update({"url": url, "payload": payload, "timeout": timeout})
        return {"choices": [{"message": {"content": "Локальный ответ"}}]}

    monkeypatch.setenv("KTK_AI_PROVIDER", "auto")
    monkeypatch.setattr(orchestrator, "post_json", fake_post)
    answer = orchestrator._local_llm_chat(
        system="Системная инструкция",
        user="Привет",
        history=[{"role": "assistant", "content": "Здравствуйте"}],
    )

    assert answer == "Локальный ответ"
    assert captured["url"].endswith("/v1/chat/completions")
    assert captured["payload"]["messages"][-1]["content"] == "Привет"
    assert captured["payload"]["stream"] is False


def test_ktk_chat_returns_short_answer_links_and_training(monkeypatch):
    monkeypatch.setenv("KTK_AI_PROVIDER", "rules")
    monkeypatch.setattr(
        orchestrator,
        "_rag",
        lambda *args, **kwargs: {
            "mode": "vector",
            "indexVersion": "test-index",
            "results": [
                {
                    "articleId": "k1-control",
                    "chunkId": "k1-control:1",
                    "title": "Управление колонной К-1",
                    "category": "Колонны",
                    "revision": "1.0",
                    "score": 0.9,
                    "text": "Давление К-1 зависит от тепловой нагрузки. "
                    "Изменения оценивают по тренду параметров.",
                },
                {
                    "articleId": "k1-control",
                    "chunkId": "k1-control:2",
                    "title": "Управление колонной К-1",
                    "category": "Колонны",
                    "revision": "1.0",
                    "score": 0.8,
                    "text": "Повторный фрагмент той же статьи.",
                },
            ],
        },
    )
    result = orchestrator.answer_question(
        {"message": "Почему меняется давление К-1?", "context": {}}
    )
    assert result["intent"] == "ktk-knowledge"
    assert result["mode"] == "local-rag-summary"
    assert len(result["answer"]) < 500
    assert "Подробности" in result["answer"]
    assert len(result["sources"]) == 1
    assert result["sources"][0]["articleId"] == "k1-control"
    assert any(
        item["trainingId"] == "MT-K1-01"
        for item in result["relatedTrainings"]
    )


def test_ktk_follow_up_reuses_previous_question(monkeypatch):
    captured = {}

    def fake_rag(query, **kwargs):
        captured["query"] = query
        return {"mode": "lexical-fallback", "results": []}

    monkeypatch.setenv("KTK_AI_PROVIDER", "rules")
    monkeypatch.setattr(orchestrator, "_rag", fake_rag)
    result = orchestrator.answer_question(
        {
            "message": "Объясни проще",
            "context": {
                "conversationHistory": [
                    {
                        "role": "user",
                        "content": "Почему меняется давление К-1?",
                    },
                    {
                        "role": "assistant",
                        "content": "Давление зависит от режима процесса.",
                        "intent": "ktk-knowledge",
                    },
                ]
            },
        }
    )
    assert result["intent"] == "ktk-knowledge"
    assert "давление К-1" in captured["query"]
    assert "Объясни проще" in captured["query"]
