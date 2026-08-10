"""Контроль целостности версионируемой базы знаний."""

from __future__ import annotations

import json
from pathlib import Path

from backend.ai.engine import ARTICLE_BY_ID, analyze_session, search_articles
from backend.knowledge import app
from backend.knowledge.catalog import load_articles

ROOT = Path(__file__).resolve().parents[2]


def test_catalog_is_comprehensive_and_unique():
    articles = load_articles()
    ids = {article["id"] for article in articles}
    assert len(articles) >= 50
    assert len(ids) == len(articles)
    assert len(app.list_categories()) == 8


def test_articles_have_safety_boundary_sources_and_valid_relations():
    articles = load_articles()
    ids = {article["id"] for article in articles}
    for article in articles:
        assert article["safetyNotice"]
        assert article["sections"]
        assert len(article["keywords"]) >= 2
        assert set(article["relatedArticleIds"]).issubset(ids)
        for source in article["sources"]:
            if source.get("url"):
                assert source["url"].startswith("https://")


def test_search_filters_and_ai_use_the_same_catalog():
    results = app.list_articles("деэмульгатор", role="Оператор")
    assert any(article["id"] == "elou-principle" for article in results)
    assert any(article["id"] == "demulsifier-dosing" for article in results)
    assert set(ARTICLE_BY_ID) == {article["id"] for article in load_articles()}
    assert search_articles("кавитация насоса")[0]["id"] == "pump-cavitation"


def test_training_hints_reference_existing_articles():
    articles = {article["id"] for article in load_articles()}
    catalog = json.loads(
        (ROOT / "frontend" / "trainer" / "src" / "training" / "catalog.json").read_text(
            encoding="utf-8"
        )
    )
    referenced = {
        hint["articleId"]
        for training in catalog
        for hint in training.get("hints", [])
    }
    assert referenced.issubset(articles)


def test_asset_path_traversal_is_not_possible():
    asset_root = app.ASSET_DIR.resolve()
    escaped = (asset_root / "../seed.json").resolve()
    assert asset_root not in escaped.parents


def test_slow_response_recommendation_links_to_existing_article():
    result = analyze_session(
        {
            "scorePercent": 80,
            "responseSeconds": 75,
            "process": {"feedFlow": 650, "levelK1": 50, "levelK2": 50},
        }
    )
    finding = next(item for item in result["findings"] if item["code"] == "RESPONSE-TIME")
    assert finding["articleId"] == "cooling-loss"
    assert finding["articleId"] in ARTICLE_BY_ID
