"""Facade над ML-моделями и интерпретируемым ranking учебных модулей."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

from backend.ai.engine import (
    _analyze_session_ml,
    ml_available,
    ml_status,
)
from backend.ai.rules_analysis import analyze_session_rules

ROOT = Path(__file__).resolve().parents[2]
GRAPH_PATH = Path(__file__).with_name("module_graph.json")
CATALOG_PATH = ROOT / "frontend" / "trainer" / "src" / "training" / "catalog.json"
METRICS_PATH = ROOT / "backend" / "ai" / "models" / "metrics.json"


def _load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


MODULE_GRAPH = _load_json(GRAPH_PATH)
TRAININGS = {item["id"]: item for item in _load_json(CATALOG_PATH)}
MODULES = {item["id"]: item for item in MODULE_GRAPH["modules"]}
ERROR_SKILLS = MODULE_GRAPH["errorSkillMap"]


def _model_version() -> str:
    digest = hashlib.sha256()
    found = False
    for path in (
        ROOT / "backend" / "ai" / "models" / "action_error_classifier.joblib",
        ROOT / "backend" / "ai" / "models" / "risk_predictor.joblib",
    ):
        if path.exists():
            found = True
            digest.update(path.read_bytes())
    return f"ml-{digest.hexdigest()[:12]}" if found else "ml-unavailable"


MODEL_VERSION = _model_version()


def _completed_modules(payload: dict[str, Any]) -> set[str]:
    completed: set[str] = set()
    for attempt in payload.get("previousAttempts") or []:
        if not isinstance(attempt, dict):
            continue
        module_id = str(
            attempt.get("moduleId") or attempt.get("exerciseId") or ""
        )
        if module_id and int(attempt.get("scorePercent") or 0) >= 75:
            completed.add(module_id)
    return completed


def _error_skills(analysis: dict[str, Any]) -> dict[str, float]:
    skills: dict[str, float] = {}
    for finding in analysis.get("localizedErrors") or []:
        classification = finding.get("classification") or {}
        label = str(classification.get("label") or "").removeprefix("ML-")
        confidence = float(classification.get("confidence") or 0.5)
        severity = str(finding.get("severity") or "info")
        severity_weight = {"critical": 1.0, "warning": 0.7, "info": 0.3}.get(
            severity, 0.3
        )
        for skill in ERROR_SKILLS.get(label, []):
            skills[skill] = max(skills.get(skill, 0), confidence * severity_weight)
    return skills


def rank_modules(
    analysis: dict[str, Any], payload: dict[str, Any]
) -> list[dict[str, Any]]:
    """Интерпретируемый baseline ranking.

    Заменяется learned-to-rank после накопления подтверждённого feedback.
    """
    skills = _error_skills(analysis)
    completed = _completed_modules(payload)
    recommended = {
        str(item.get("trainingId")): index
        for index, item in enumerate(analysis.get("recommendations") or [])
        if item.get("trainingId")
    }
    recommendation_confidence: dict[str, float] = {}
    for finding in analysis.get("localizedErrors") or []:
        training_id = str(finding.get("trainingId") or "")
        confidence = float((finding.get("classification") or {}).get("confidence") or 0.5)
        if training_id:
            recommendation_confidence[training_id] = max(
                recommendation_confidence.get(training_id, 0),
                confidence,
            )
    current_module = str(payload.get("exerciseId") or "")
    current_family = "-".join(current_module.split("-")[:2])
    current_score = int(payload.get("scorePercent") or 0)
    candidates: list[dict[str, Any]] = []
    for module_id, graph_item in MODULES.items():
        training = TRAININGS.get(module_id)
        if not training:
            continue
        module_skills = set(graph_item.get("skills") or [])
        matched = sorted(module_skills.intersection(skills))
        skill_score = max((skills[item] for item in matched), default=0)
        recommendation_boost = (
            max(0.1, 0.35 - recommended[module_id] * 0.05)
            * recommendation_confidence.get(module_id, 0.5)
            if module_id in recommended
            else 0
        )
        context_boost = 0.0
        if current_module and module_id == current_module and current_score < 75:
            context_boost = 0.35
        elif (
            current_family
            and "-".join(module_id.split("-")[:2]) == current_family
        ):
            context_boost = 0.15
        repeat_penalty = 0.3 if module_id in completed else 0
        prerequisites = list(graph_item.get("prerequisites") or [])
        missing_prerequisites = [
            item for item in prerequisites if item not in completed
        ]
        prerequisite_penalty = 0.25 * len(missing_prerequisites)
        score = max(
            0.0,
            min(
                1.0,
                skill_score
                + recommendation_boost
                + context_boost
                - repeat_penalty
                - prerequisite_penalty,
            ),
        )
        if score <= 0 and module_id not in recommended:
            continue
        reasons: list[str] = []
        if matched:
            reasons.append("Пробелы навыков: " + ", ".join(matched))
        if module_id in recommended:
            reasons.append("Модуль выбран по классифицированным ошибкам сессии")
        if context_boost:
            reasons.append("Модуль относится к текущему технологическому блоку")
        if missing_prerequisites:
            reasons.append(
                "Сначала пройти: " + ", ".join(missing_prerequisites)
            )
        candidates.append(
            {
                "moduleId": module_id,
                "title": training.get("title", ""),
                "segment": training.get("segment", ""),
                "durationMinutes": training.get("durationMinutes", 0),
                "score": round(score, 4),
                "skills": sorted(module_skills),
                "matchedSkills": matched,
                "prerequisites": prerequisites,
                "missingPrerequisites": missing_prerequisites,
                "eligible": not missing_prerequisites,
                "reasons": reasons,
            }
        )
    candidates.sort(
        key=lambda item: (
            not item["eligible"],
            -float(item["score"]),
            str(item["moduleId"]),
        )
    )
    return candidates[:5]


def analyze(payload: dict[str, Any]) -> dict[str, Any]:
    if ml_available():
        try:
            result = _analyze_session_ml(payload)
            result["mode"] = "local-ml-classification"
        except Exception as exc:  # noqa: BLE001
            result = analyze_session_rules(payload)
            result["mode"] = "local-rules-fallback"
            result["mlFallbackReason"] = str(exc)
    else:
        result = analyze_session_rules(payload)
        result["mode"] = "local-rules-fallback"
        result["mlFallbackReason"] = ml_status().get("reason") or "models unavailable"

    # Связный текст формирует orchestrator/LLM, не ML-сервис.
    result.pop("debrief", None)
    ranking = rank_modules(result, payload)
    result["recommendationRanking"] = ranking
    result["nextBestModule"] = next(
        (item for item in ranking if item.get("eligible")),
        ranking[0] if ranking else None,
    )
    result["modelVersion"] = MODEL_VERSION
    result["skillGraphVersion"] = MODULE_GRAPH["version"]
    return result


def recommend(payload: dict[str, Any]) -> dict[str, Any]:
    analysis = payload.get("analysis")
    if not isinstance(analysis, dict):
        analysis = analyze(payload)
    ranking = rank_modules(analysis, payload)
    return {
        "ok": True,
        "modelVersion": MODEL_VERSION,
        "skillGraphVersion": MODULE_GRAPH["version"],
        "rankingMode": "interpretable-hybrid-baseline",
        "candidates": ranking,
        "nextBestModule": next(
            (item for item in ranking if item.get("eligible")),
            ranking[0] if ranking else None,
        ),
    }


def health() -> dict[str, Any]:
    metrics = _load_json(METRICS_PATH) if METRICS_PATH.exists() else None
    return {
        "status": "ok",
        "service": "ml-recommender",
        "modelVersion": MODEL_VERSION,
        "skillGraphVersion": MODULE_GRAPH["version"],
        "ml": ml_status(),
        "trainingMetrics": metrics,
    }
