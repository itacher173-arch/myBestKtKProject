from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).parent
LEGACY_SEED = ROOT / "seed.json"
CONTENT_ROOT = ROOT / "content" / "ru"

DEFAULT_NOTICE = (
    "Учебный материал КТК. Не является производственной инструкцией и не задаёт "
    "уставки реальной установки. Перед любым воздействием на оборудование применяются "
    "утверждённый технологический регламент, ПЛА/ПМЛА, инструкции изготовителя и указания ответственного руководителя."
)

CATEGORY_MAP = {
    "Технологический процесс": "01. Основы процесса",
    "Оборудование": "02. Оборудование",
    "Инженерные системы": "05. Инженерные системы",
    "Промышленная безопасность": "06. Безопасность и отклонения",
    "Аналитический контроль": "07. Аналитика и диагностика",
    "Работа с КТК": "08. Работа с КТК",
}


def _read(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _normalize(article: dict[str, Any]) -> dict[str, Any]:
    result = dict(article)
    result["category"] = CATEGORY_MAP.get(result["category"], result["category"])
    result.setdefault("revision", "1.0")
    result.setdefault("updatedAt", "2026-08-10")
    result.setdefault("status", "requires-expert-review")
    result.setdefault("roles", ["Обучаемый", "Оператор"])
    result.setdefault("learningObjectives", [])
    result.setdefault("equipmentIds", [])
    result.setdefault("scenarioIds", [])
    result.setdefault("relatedArticleIds", [])
    result.setdefault("safetyNotice", DEFAULT_NOTICE)
    result.setdefault("sections", [
        {
            "title": "Основные положения",
            "paragraphs": result.get("content", []),
        }
    ])
    result.setdefault("sources", [{
        "title": result.get("source", "Учебная модель КТК"),
        "publisher": "КТК ЭЛОУ-АВТ",
        "kind": "internal-training",
    }])
    result["source"] = result.get("source") or result["sources"][0]["title"]
    result["content"] = result.get("content") or flatten_article(result)
    return result


def load_articles() -> list[dict[str, Any]]:
    """Loads legacy seed and overlays modular content packs by article id."""
    articles = {item["id"]: item for item in _read(LEGACY_SEED)}
    if CONTENT_ROOT.exists():
        for path in sorted(CONTENT_ROOT.rglob("*.json")):
            payload = _read(path)
            items = payload if isinstance(payload, list) else payload.get("articles", [])
            for item in items:
                articles[item["id"]] = item
    return [_normalize(article) for article in articles.values()]


def flatten_article(article: dict[str, Any]) -> list[str]:
    parts: list[str] = []
    for section in article.get("sections", []):
        if section.get("title"):
            parts.append(str(section["title"]))
        parts.extend(str(item) for item in section.get("paragraphs", []))
        parts.extend(str(item) for item in section.get("bullets", []))
        if section.get("warning"):
            parts.append(str(section["warning"]))
    return parts


def searchable_text(article: dict[str, Any]) -> str:
    values = [
        article["title"],
        article["summary"],
        article["category"],
        " ".join(article.get("keywords", [])),
        " ".join(article.get("equipmentIds", [])),
        " ".join(article.get("scenarioIds", [])),
        " ".join(article.get("learningObjectives", [])),
        " ".join(flatten_article(article)),
    ]
    return " ".join(values)
