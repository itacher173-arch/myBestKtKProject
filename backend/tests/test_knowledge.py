"""Контроль целостности версионируемой базы знаний."""

from __future__ import annotations

import json
from pathlib import Path

from backend.ai.engine import ARTICLE_BY_ID, analyze_session, search_articles
from backend.knowledge import app
from backend.knowledge.catalog import REFERENCE_ROOT, load_articles, load_references

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
    references = {item["id"]: item for item in load_references()}
    for article in articles:
        assert article["safetyNotice"]
        assert article["sections"]
        assert len(article["keywords"]) >= 2
        assert set(article["relatedArticleIds"]).issubset(ids)
        assert set(article["sourceIds"]).issubset(references)
        paragraph_count = sum(
            len(section.get("paragraphs", [])) for section in article["sections"]
        )
        body_length = sum(
            len(item)
            for section in article["sections"]
            for item in section.get("paragraphs", []) + section.get("bullets", [])
        )
        assert paragraph_count >= 6, article["id"]
        assert body_length >= 1500, article["id"]
        for section in article["sections"]:
            assert set(section.get("sourceIds", [])).issubset(references)
        for source in article["sources"]:
            assert "url" not in source
            assert (REFERENCE_ROOT / source["localPath"]).is_file()


def test_reference_catalog_has_only_local_safe_files():
    references = load_references()
    ids = {item["id"] for item in references}
    assert len(ids) == len(references) >= 8
    root = REFERENCE_ROOT.resolve()
    for reference in references:
        assert "url" not in reference
        target = (root / reference["localPath"]).resolve()
        assert root in target.parents
        assert target.is_file()
        if target.suffix.casefold() == ".pdf":
            assert target.read_bytes().startswith(b"%PDF")


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
    reference_root = app.REFERENCE_DIR.resolve()
    reference_escape = (reference_root / "../seed.json").resolve()
    assert reference_root not in reference_escape.parents


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
