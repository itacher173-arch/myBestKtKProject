from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).parent
LEGACY_SEED = ROOT / "seed.json"
CONTENT_ROOT = ROOT / "content" / "ru"
REFERENCE_ROOT = ROOT / "references"
REFERENCE_CATALOG = REFERENCE_ROOT / "catalog.json"

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

DEFAULT_REFERENCE_IDS = {
    "01. Основы процесса": ["TECH-01", "STD-01"],
    "02. Оборудование": ["METH-01", "STD-01"],
    "03. Электрообессоливание": ["TECH-01", "STD-01"],
    "04. Перегонка": ["TECH-01", "STD-01"],
    "05. Инженерные системы": ["TECH-02", "STD-01"],
    "06. Безопасность и отклонения": ["METH-01", "NPA-04", "STD-01"],
    "07. Аналитика и диагностика": ["TECH-01", "STD-01"],
    "08. Работа с КТК": ["METH-02"],
}


def _read(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def load_references() -> list[dict[str, Any]]:
    if not REFERENCE_CATALOG.exists():
        return []
    return _read(REFERENCE_CATALOG)


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
    reference_by_id = {item["id"]: item for item in load_references()}
    source_ids = result.get("sourceIds") or DEFAULT_REFERENCE_IDS.get(result["category"], [])
    section_source_ids = [
        source_id
        for section in result["sections"]
        for source_id in section.get("sourceIds", [])
    ]
    result["sourceIds"] = list(dict.fromkeys([*source_ids, *section_source_ids]))
    result["sources"] = [
        reference_by_id[source_id]
        for source_id in result["sourceIds"]
        if source_id in reference_by_id
    ]
    result["source"] = result.get("source") or (
        result["sources"][0]["title"]
        if result["sources"]
        else "Локальная редакция базы знаний КТК"
    )
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
                previous = articles.get(item["id"], {})
                merged = {**previous, **item}
                if item.get("appendSections"):
                    merged["sections"] = [
                        *previous.get("sections", []),
                        *item["appendSections"],
                    ]
                    merged.pop("appendSections", None)
                articles[item["id"]] = merged
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
        " ".join(source.get("title", "") for source in article.get("sources", [])),
        " ".join(flatten_article(article)),
    ]
    return " ".join(values)
