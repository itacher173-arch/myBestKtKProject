"""Тесты ИИ-модуля: rule-based анализ сессии и knowledge RAG чат."""

from __future__ import annotations

import json
from http.server import ThreadingHTTPServer
from threading import Thread
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import pytest

from backend.ai import app as ai_app
from backend.ai.engine import analyze_session, answer_question, search_articles


def _base_process(**overrides: object) -> dict:
    process = {
        "saltMgL": 3.0,
        "waterAfterElou": 0.1,
        "feedFlow": 700.0,
        "pressureK1": 2.0,
        "pressureK2": 0.5,
        "levelK1": 50.0,
        "levelK2": 50.0,
        "tempFurnaceOut": 340.0,
        "instrumentAirOk": True,
        "coolingWaterOk": True,
        "ventElouOk": True,
        "gasPercent": 0.0,
    }
    process.update(overrides)
    return process


def test_analyze_recommends_elou_for_bad_quality():
    result = analyze_session(
        {
            "scorePercent": 62,
            "penalty": 4,
            "process": _base_process(saltMgL=18, waterAfterElou=0.42),
            "actionsLog": [{"at": 1, "description": "washWaterOn: включено"}],
            "systemEvents": [],
        }
    )
    codes = {item["code"] for item in result["findings"]}
    ids = {item["trainingId"] for item in result["recommendations"]}
    assert "QUALITY-ELOU" in codes
    assert "MT-ELOU-02" in ids
    assert result["mode"] == "local-explainable-analysis"
    assert result["trajectory"][0]["category"] == "ЭЛОУ"


def test_analyze_detects_long_pause_and_metrics():
    result = analyze_session(
        {
            "scorePercent": 80,
            "penalty": 0,
            "process": _base_process(),
            "actionsLog": [
                {"at": 1_000, "description": "Насос N-1: start"},
                {"at": 101_000, "description": "Подача топливного газа: 55%"},
            ],
            "systemEvents": [],
        }
    )
    assert result["metrics"]["durationSeconds"] == 100.0
    assert result["metrics"]["controlAreasCount"] == 2
    assert "ACTION-PAUSE" in {item["code"] for item in result["findings"]}


@pytest.mark.parametrize(
    ("process_kwargs", "code", "training_id"),
    [
        ({"feedFlow": 200}, "FEED-LOW", "MT-FEED-02"),
        ({"pressureK1": 4.6}, "K1-PRESSURE", "MT-K1-01"),
        ({"levelK1": 10}, "K1-LEVEL", "MT-K1-02"),
        ({"tempFurnaceOut": 400}, "FURNACE-TEMP", "MT-FURN-01"),
        ({"pressureK2": 1.5}, "K2-PRESSURE", "MT-K2-01"),
        ({"levelK2": 8}, "K2-LEVEL", "MT-K2-02"),
        ({"instrumentAirOk": False}, "UTILITY-AIR", "MT-UTIL-01"),
        ({"coolingWaterOk": False}, "UTILITY-COOLING", "MT-SAFE-01"),
        ({"ventElouOk": False, "gasPercent": 25}, "VENT-GAS", "MT-VENT-01"),
    ],
)
def test_analyze_process_findings(process_kwargs, code, training_id):
    result = analyze_session(
        {
            "scorePercent": 50,
            "penalty": 0,
            "process": _base_process(**process_kwargs),
            "actionsLog": [{"at": 1, "description": "start"}],
            "systemEvents": [],
        }
    )
    codes = {item["code"] for item in result["findings"]}
    ids = {item["trainingId"] for item in result["recommendations"] if item.get("trainingId")}
    assert code in codes
    assert training_id in ids


def test_analyze_response_time_and_rejected_commands():
    result = analyze_session(
        {
            "scorePercent": 70,
            "penalty": 0,
            "responseSeconds": 75,
            "process": _base_process(),
            "actionsLog": [{"at": 1, "description": "аварийный останов"}],
            "systemEvents": [{"description": "Команда отклонена: нет прав"}],
        }
    )
    codes = {item["code"] for item in result["findings"]}
    assert "RESPONSE-TIME" in codes
    assert "REJECTED-COMMANDS" in codes


def test_analyze_good_session_has_strengths():
    result = analyze_session(
        {
            "scorePercent": 95,
            "penalty": 0,
            "responseSeconds": 20,
            "process": _base_process(),
            "actionsLog": [
                {"at": 1_000, "description": "Насос N-1: start"},
                {"at": 5_000, "description": "Уровень К-1: 55%"},
            ],
            "systemEvents": [],
        }
    )
    assert result["overallLevel"] == "Высокая готовность"
    assert result["strengths"]
    assert not any(item["severity"] == "critical" for item in result["findings"])


def test_search_articles_ranks_k1_pressure():
    articles = search_articles("давление К-1")
    assert articles
    assert articles[0]["id"] == "k1-control"


def test_chat_returns_sources_and_related_training(monkeypatch):
    monkeypatch.setenv("KTK_AI_PROVIDER", "rules")
    result = answer_question({"message": "Как снизить давление К-1?", "context": {}})
    assert result["answer"]
    assert result["sources"]
    assert result["sources"][0]["articleId"] == "k1-control"
    assert result["mode"] == "local-knowledge-rag"
    assert result["relatedTrainings"]
    assert result["relatedTrainings"][0]["trainingId"] == "MT-K1-01"


def test_chat_empty_message_raises():
    with pytest.raises(ValueError, match="вопрос"):
        answer_question({"message": "   ", "context": {}})


def test_chat_ollama_fallback_when_unreachable(monkeypatch):
    monkeypatch.setenv("KTK_AI_PROVIDER", "auto")
    monkeypatch.setenv("KTK_OLLAMA_URL", "http://127.0.0.1:1")
    result = answer_question({"message": "Что такое ЭЛОУ?", "context": {}})
    assert result["answer"]
    assert result["mode"] == "local-knowledge-rag"


@pytest.fixture()
def ai_server(monkeypatch):
    monkeypatch.setenv("KTK_AI_ENABLED", "true")
    monkeypatch.setenv("KTK_AI_PROVIDER", "rules")
    server = ThreadingHTTPServer(("127.0.0.1", 0), ai_app.Handler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    host, port = server.server_address
    yield f"http://{host}:{port}"
    server.shutdown()
    thread.join(timeout=2)


def _http_json(method: str, url: str, body: dict | None = None) -> tuple[int, dict]:
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = Request(
        url,
        data=data,
        method=method,
        headers={"Content-Type": "application/json"} if body is not None else {},
    )
    try:
        with urlopen(req, timeout=5) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except HTTPError as exc:
        payload = json.loads(exc.read().decode("utf-8") or "{}")
        return exc.code, payload


def test_ai_http_health_and_endpoints(ai_server):
    status, health = _http_json("GET", f"{ai_server}/health")
    assert status == 200
    assert health["service"] == "ai"
    assert health["enabled"] is True
    assert health["provider"] == "rules"

    status, analysis = _http_json(
        "POST",
        f"{ai_server}/analyze",
        {
            "scorePercent": 60,
            "penalty": 0,
            "process": _base_process(saltMgL=12),
            "actionsLog": [{"at": 1, "description": "washWaterOn"}],
            "systemEvents": [],
        },
    )
    assert status == 200
    assert any(item["code"] == "QUALITY-ELOU" for item in analysis["findings"])

    status, chat = _http_json(
        "POST",
        f"{ai_server}/chat",
        {"message": "Как работает ЭЛОУ?", "context": {}},
    )
    assert status == 200
    assert chat["answer"]
    assert chat["sources"]


def test_ai_http_disabled_returns_503(monkeypatch):
    monkeypatch.setenv("KTK_AI_ENABLED", "false")
    monkeypatch.setenv("KTK_AI_PROVIDER", "rules")
    server = ThreadingHTTPServer(("127.0.0.1", 0), ai_app.Handler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        host, port = server.server_address
        base = f"http://{host}:{port}"
        status, health = _http_json("GET", f"{base}/health")
        assert status == 200
        assert health["enabled"] is False
        status, body = _http_json(
            "POST",
            f"{base}/analyze",
            {"scorePercent": 50, "process": {}, "actionsLog": [], "systemEvents": []},
        )
        assert status == 503
        assert "отключ" in str(body.get("error", "")).casefold()
    finally:
        server.shutdown()
        thread.join(timeout=2)


def test_live_gateway_ai_roundtrip():
    """Живой docker/локальный gateway :8000 — пропускается, если недоступен."""
    try:
        status, health = _http_json("GET", "http://127.0.0.1:8000/api/health")
    except Exception:
        pytest.skip("gateway недоступен")
    if status != 200 or health.get("services", {}).get("ai", {}).get("status") != "ok":
        pytest.skip("AI через gateway недоступен")

    status, analysis = _http_json(
        "POST",
        "http://127.0.0.1:8000/api/ai/analyze",
        {
            "scorePercent": 55,
            "penalty": 0,
            "process": _base_process(saltMgL=15, waterAfterElou=0.4),
            "actionsLog": [{"at": 1, "description": "washWaterOn: включено"}],
            "systemEvents": [],
        },
    )
    if status == 401:
        pytest.skip("gateway требует аутентифицированную сессию")
    assert status == 200
    assert any(item["code"] == "QUALITY-ELOU" for item in analysis["findings"])

    status, chat = _http_json(
        "POST",
        "http://127.0.0.1:8000/api/ai/chat",
        {"message": "Как снизить давление К-1?", "context": {}},
    )
    assert status == 200
    assert chat["answer"]
    assert chat["sources"][0]["articleId"] == "k1-control"
