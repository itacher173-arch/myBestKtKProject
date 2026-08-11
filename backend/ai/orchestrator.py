"""Оркестрация ML, RAG и локальной LLM без смешивания ответственностей."""

from __future__ import annotations

import json
import os
import time
import uuid
from pathlib import Path
from typing import Any

from backend.ai.rules_analysis import analyze_session_rules
from backend.ai.service_client import (
    ServiceUnavailable,
    get_json,
    post_json,
)
from backend.rag.service import search as local_rag_search

ML_URL = os.getenv("KTK_ML_URL", "http://ml-recommender:8109").rstrip("/")
RAG_URL = os.getenv("KTK_RAG_URL", "http://rag-api:8108").rstrip("/")
OLLAMA_URL = os.getenv("KTK_OLLAMA_URL", "http://ollama:11434").rstrip("/")
LLM_MODEL = os.getenv("KTK_OLLAMA_MODEL", "ktk-assistant")
PROMPT_VERSION = os.getenv("KTK_AI_PROMPT_VERSION", "ai-prompts-v1")
CATALOG_PATH = (
    Path(__file__).resolve().parents[2]
    / "frontend"
    / "trainer"
    / "src"
    / "training"
    / "catalog.json"
)


def _training_catalog() -> dict[str, dict[str, Any]]:
    try:
        catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return {str(item["id"]): item for item in catalog}


TRAINING_CATALOG = _training_catalog()


def _article_training_map() -> dict[str, list[dict[str, Any]]]:
    mapping: dict[str, list[dict[str, Any]]] = {}
    for training in TRAINING_CATALOG.values():
        for hint in training.get("hints") or []:
            article_id = hint.get("articleId")
            if not article_id:
                continue
            candidate = {
                "trainingId": training["id"],
                "trainingTitle": training.get("title", ""),
                "segment": training.get("segment", ""),
            }
            items = mapping.setdefault(str(article_id), [])
            if candidate not in items:
                items.append(candidate)
    return mapping


ARTICLE_TRAININGS = _article_training_map()


def _provider() -> str:
    return os.getenv("KTK_AI_PROVIDER", "rules").casefold()


def _rag(
    query: str,
    *,
    filters: dict[str, Any] | None = None,
    limit: int = 6,
) -> dict[str, Any]:
    payload = {"query": query, "filters": filters or {}, "limit": limit}
    try:
        return post_json(f"{RAG_URL}/search", payload, timeout=20)
    except ServiceUnavailable:
        return local_rag_search(query, filters=filters, limit=limit)


def _ollama_chat(
    *,
    system: str,
    user: str,
    temperature: float = 0.2,
) -> str | None:
    if _provider() not in {"auto", "ollama"}:
        return None
    payload = {
        "model": LLM_MODEL,
        "stream": False,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "options": {"temperature": temperature},
    }
    try:
        response = post_json(f"{OLLAMA_URL}/api/chat", payload, timeout=90)
    except ServiceUnavailable:
        return None
    text = str((response.get("message") or {}).get("content") or "").strip()
    return text or None


def _source_view(results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "articleId": item.get("articleId"),
            "chunkId": item.get("chunkId"),
            "title": item.get("title"),
            "category": item.get("category"),
            "revision": item.get("revision"),
            "score": item.get("score"),
            "indexVersion": item.get("indexVersion"),
        }
        for item in results
    ]


def _analysis_query(analysis: dict[str, Any], payload: dict[str, Any]) -> str:
    findings = analysis.get("findings") or []
    training = TRAINING_CATALOG.get(str(payload.get("exerciseId") or ""), {})
    parts = [
        str(payload.get("exerciseName") or payload.get("exerciseId") or ""),
        str(training.get("segment") or ""),
        str(training.get("description") or ""),
        " ".join(str(item) for item in training.get("objectives") or []),
        " ".join(
            str(item.get("text") or "") for item in training.get("hints") or []
        ),
        *[
            " ".join(
                str(value or "")
                for value in (
                    item.get("title"),
                    item.get("evidence"),
                    item.get("recommendation"),
                )
            )
            for item in findings[:5]
        ],
    ]
    next_module = analysis.get("nextBestModule") or {}
    parts.extend(
        [
            str(next_module.get("title") or ""),
            " ".join(str(item) for item in next_module.get("skills") or []),
        ]
    )
    return " ".join(item for item in parts if item).strip() or "учебный тренажёр"


def _template_debrief(
    analysis: dict[str, Any], payload: dict[str, Any]
) -> str:
    score = (analysis.get("metrics") or {}).get("scorePercent")
    findings = analysis.get("findings") or []
    next_module = analysis.get("nextBestModule") or {}
    parts = [
        f"Результат сессии: {analysis.get('overallLevel', 'обработан')}"
        + (f", оценка {score}%." if score is not None else ".")
    ]
    if findings:
        titles = "; ".join(
            str(item.get("title") or "") for item in findings[:3]
        )
        parts.append(f"Основные зоны внимания: {titles}.")
    else:
        parts.append("Существенных отклонений в доступных данных не выявлено.")
    if next_module.get("title"):
        parts.append(
            f"Следующий рекомендуемый модуль: «{next_module['title']}»."
        )
    return " ".join(parts)


def _llm_debrief(
    analysis: dict[str, Any],
    payload: dict[str, Any],
    sources: list[dict[str, Any]],
) -> tuple[str, str]:
    context = {
        "operator": payload.get("userName"),
        "exercise": payload.get("exerciseName") or payload.get("exerciseId"),
        "overallLevel": analysis.get("overallLevel"),
        "metrics": analysis.get("metrics"),
        "findings": (analysis.get("findings") or [])[:5],
        "nextBestModule": analysis.get("nextBestModule"),
        "sources": [
            {
                "citation": f"[{item.get('articleId')}/{item.get('chunkId')}]",
                "title": item.get("title"),
                "text": item.get("text"),
            }
            for item in sources[:6]
        ],
    }
    system = (
        "Ты локальный педагогический ассистент КТК ЭЛОУ-АВТ. "
        "Объясняй только факты из JSON и фрагментов sources. "
        "Не выдумывай параметры и не давай команды для реальной установки. "
        "Сформируй 2–4 коротких абзаца: сильные стороны, ошибки, следующий модуль. "
        "Для фактов из базы знаний указывай citation. Если источников недостаточно, "
        "скажи об этом."
    )
    text = _ollama_chat(
        system=system,
        user=json.dumps(context, ensure_ascii=False),
        temperature=0.2,
    )
    if text:
        return text, "local-ollama-rag-debrief"
    return _template_debrief(analysis, payload), "local-template-debrief"


def analyze_session(payload: dict[str, Any]) -> dict[str, Any]:
    try:
        analysis = post_json(f"{ML_URL}/analyze", payload, timeout=60)
        ml_source = "ml-recommender"
    except ServiceUnavailable as exc:
        analysis = analyze_session_rules(payload)
        analysis["mode"] = "local-rules-fallback"
        analysis["mlFallbackReason"] = str(exc)
        ml_source = "orchestrator-fallback"

    query = _analysis_query(analysis, payload)
    process = payload.get("process")
    scenario_id = payload.get("scenarioId") or (
        process.get("scenarioId") if isinstance(process, dict) else None
    )
    rag = _rag(
        query,
        filters={
            "scenarioIds": [scenario_id] if scenario_id else [],
        },
        limit=6,
    )
    rag_results = rag.get("results") or []
    narrative, debrief_mode = _llm_debrief(analysis, payload, rag_results)
    analysis["debrief"] = {"narrative": narrative, "mode": debrief_mode}
    analysis["sources"] = _source_view(rag_results)
    analysis["orchestration"] = {
        "ml": ml_source,
        "rag": rag.get("mode"),
        "llm": debrief_mode,
        "promptVersion": PROMPT_VERSION,
        "generatedAt": int(time.time() * 1000),
    }
    analysis.setdefault("analysisId", f"analysis-{uuid.uuid4().hex[:12]}")
    analysis.setdefault("generatedAt", int(time.time() * 1000))
    return analysis


def answer_question(payload: dict[str, Any]) -> dict[str, Any]:
    message = str(payload.get("message") or "").strip()
    if not message:
        raise ValueError("Введите вопрос")
    context = payload.get("context") or {}
    process = context.get("process") if isinstance(context, dict) else {}
    filters: dict[str, Any] = {}
    scenario_id = context.get("scenarioId") if isinstance(context, dict) else None
    if scenario_id:
        filters["scenarioIds"] = [scenario_id]
    rag = _rag(message, filters=filters, limit=6)
    results = rag.get("results") or []
    sources_text = [
        {
            "citation": f"[{item.get('articleId')}/{item.get('chunkId')}]",
            "title": item.get("title"),
            "text": item.get("text"),
        }
        for item in results
    ]
    system = (
        "Ты локальный учебный ассистент КТК ЭЛОУ-АВТ. "
        "Отвечай только по sources и контексту учебной симуляции. "
        "Каждое утверждение из базы знаний сопровождай citation. "
        "Не выдавай производственные инструкции или реальные уставки. "
        "Если ответа нет в sources, прямо скажи, что данных недостаточно."
    )
    answer = _ollama_chat(
        system=system,
        user=json.dumps(
            {
                "question": message,
                "simulationContext": {"process": process},
                "sources": sources_text,
            },
            ensure_ascii=False,
        ),
    )
    mode = "local-ollama-rag"
    if not answer:
        mode = "local-rag-extractive"
        if results:
            answer = "\n\n".join(
                f"{item.get('title')}: {item.get('text')} "
                f"[{item.get('articleId')}/{item.get('chunkId')}]"
                for item in results[:2]
            )
        else:
            answer = (
                "В утверждённой базе знаний не найдено достаточно данных для ответа."
            )
    related: list[dict[str, Any]] = []
    used: set[str] = set()
    for item in results:
        for training in ARTICLE_TRAININGS.get(str(item.get("articleId")), []):
            training_id = training["trainingId"]
            if training_id and training_id not in used:
                related.append(training)
                used.add(training_id)
    return {
        "messageId": f"msg-{uuid.uuid4().hex[:12]}",
        "answer": answer,
        "mode": mode,
        "sources": _source_view(results[:3]),
        "relatedTrainings": related[:3],
        "promptVersion": PROMPT_VERSION,
        "indexVersion": rag.get("indexVersion"),
    }


def predict_risk(payload: dict[str, Any]) -> dict[str, Any]:
    try:
        return post_json(f"{ML_URL}/risk-preview", payload, timeout=30)
    except ServiceUnavailable as exc:
        return {
            "ok": False,
            "available": False,
            "error": str(exc),
        }


def health() -> dict[str, Any]:
    downstream: dict[str, Any] = {}
    for name, url in (
        ("ml", f"{ML_URL}/health"),
        ("rag", f"{RAG_URL}/health"),
        ("ollama", f"{OLLAMA_URL}/api/tags"),
    ):
        try:
            payload = get_json(url, timeout=2)
            downstream[name] = {"status": "ok", "detail": payload}
        except ServiceUnavailable as exc:
            downstream[name] = {"status": "unavailable", "error": str(exc)}
    return {
        "status": "ok",
        "service": "ai",
        "role": "orchestrator",
        "provider": _provider(),
        "model": LLM_MODEL,
        "promptVersion": PROMPT_VERSION,
        "downstream": downstream,
    }
