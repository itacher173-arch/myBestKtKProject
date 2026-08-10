from __future__ import annotations

import json
import os
import re
import time
import uuid
from pathlib import Path
from typing import Any
from urllib.error import URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[2]
TRAININGS = json.loads(
    (ROOT / "frontend" / "trainer" / "src" / "training" / "catalog.json").read_text(
        encoding="utf-8"
    )
)
ARTICLES = json.loads(
    (ROOT / "frontend" / "trainer" / "src" / "knowledge" / "seed.json").read_text(encoding="utf-8")
)
TRAINING_BY_ID = {item["id"]: item for item in TRAININGS}
ARTICLE_BY_ID = {item["id"]: item for item in ARTICLES}

STOP_WORDS = {
    "как", "что", "это", "при", "для", "или", "где", "когда", "какой", "какая",
    "какие", "нужно", "надо", "можно", "почему", "если", "после", "перед", "через",
    "the", "and", "how", "what", "with", "from",
}

ARTICLE_TRAININGS = {
    "feed-system": "MT-FEED-01",
    "feed-pumps": "MT-FEED-02",
    "elou-principle": "MT-ELOU-01",
    "elou-quality": "MT-ELOU-02",
    "e1-water": "MT-E1-01",
    "k1-control": "MT-K1-01",
    "k1-low-level": "MT-K1-02",
    "furnace-operation": "MT-FURN-01",
    "furnace-safety": "MT-FURN-01",
    "k2-control": "MT-K2-01",
    "k2-low-level": "MT-K2-02",
    "instrument-air": "MT-UTIL-01",
    "ventilation": "MT-VENT-01",
    "cooling-system": "MT-SAFE-01",
    "cooling-loss": "MT-SAFE-01",
}


def _tokens(text: str) -> set[str]:
    return {
        token
        for token in re.findall(r"[a-zа-яё0-9-]{2,}", text.casefold())
        if token not in STOP_WORDS
    }


def search_articles(query: str, limit: int = 4) -> list[dict[str, Any]]:
    query_tokens = _tokens(query)
    scored: list[tuple[int, dict[str, Any]]] = []
    for article in ARTICLES:
        title = _tokens(article["title"])
        keywords = _tokens(" ".join(article["keywords"]))
        summary = _tokens(article["summary"])
        content = _tokens(" ".join(article["content"]))
        score = (
            len(query_tokens & title) * 8
            + len(query_tokens & keywords) * 6
            + len(query_tokens & summary) * 3
            + len(query_tokens & content)
        )
        if score:
            scored.append((score, article))
    if not scored:
        scored = [(1, ARTICLE_BY_ID["process-overview"]), (1, ARTICLE_BY_ID["trainer-use"])]
    scored.sort(key=lambda item: (-item[0], item[1]["title"]))
    return [article for _, article in scored[:limit]]


def _recommendation(training_id: str, article_id: str, reason: str) -> dict[str, Any]:
    training = TRAINING_BY_ID[training_id]
    article = ARTICLE_BY_ID[article_id]
    return {
        "trainingId": training_id,
        "trainingTitle": training["title"],
        "segment": training["segment"],
        "durationMinutes": training["durationMinutes"],
        "reason": reason,
        "articleId": article_id,
        "articleTitle": article["title"],
    }


def analyze_session(payload: dict[str, Any]) -> dict[str, Any]:
    process = payload.get("process") or {}
    actions = payload.get("actionsLog") or []
    events = payload.get("systemEvents") or []
    descriptions = [str(item.get("description", "")) for item in actions]
    def classify_action(description: str) -> tuple[str, str]:
        text = description.casefold()
        if "запущено упражнение" in text:
            return "Сессия", "Инициализация учебного сценария"
        if "аварийн" in text or "защита" in text:
            return "Безопасность", "Защитное воздействие на технологический процесс"
        if "инженерная среда" in text:
            return "Инженерные системы", "Изменение доступности обеспечивающей системы"
        if "насос" in text or "задвижка" in text:
            return "Подача и транспорт", "Изменение гидравлической схемы или состояния насоса"
        if any(token in text for token in ("demulsifier", "electricfield", "washwater", "дренирование")):
            return "ЭЛОУ", "Воздействие на качество обессоливания или водный слой"
        if "топлив" in text:
            return "Печной тракт", "Изменение тепловой нагрузки печей"
        if "уров" in text:
            return "Колонны", "Корректировка контура уровня"
        if "avofan" in text:
            return "Охлаждение", "Изменение воздушного охлаждения"
        return "Общее управление", "Операторское воздействие"

    trajectory: list[dict[str, Any]] = []
    timestamps: list[int] = []
    for index, action in enumerate(actions):
        description = str(action.get("description", ""))
        category, interpretation = classify_action(description)
        timestamp = int(action.get("at", 0) or 0)
        if timestamp:
            timestamps.append(timestamp)
        trajectory.append(
            {
                "sequence": index + 1,
                "at": timestamp,
                "category": category,
                "description": description,
                "interpretation": interpretation,
            }
        )
    gaps = [max(0.0, (right - left) / 1000) for left, right in zip(timestamps, timestamps[1:])]
    duration_seconds = max(0.0, (timestamps[-1] - timestamps[0]) / 1000) if len(timestamps) > 1 else 0.0
    max_pause_seconds = max(gaps, default=0.0)
    control_areas = sorted({item["category"] for item in trajectory if item["category"] != "Сессия"})
    score = int(payload.get("scorePercent", 0))
    penalty = int(payload.get("penalty", 0))
    response_seconds = payload.get("responseSeconds")
    findings: list[dict[str, Any]] = []
    strengths: list[str] = []
    recommendations: list[dict[str, Any]] = []
    recommendation_ids: set[str] = set()

    def add_finding(
        code: str,
        severity: str,
        title: str,
        evidence: str,
        recommendation: str,
        training_id: str,
        article_id: str,
    ) -> None:
        findings.append(
            {
                "code": code,
                "severity": severity,
                "title": title,
                "evidence": evidence,
                "recommendation": recommendation,
                "trainingId": training_id,
                "articleId": article_id,
            }
        )
        if training_id not in recommendation_ids:
            recommendations.append(_recommendation(training_id, article_id, recommendation))
            recommendation_ids.add(training_id)

    salt = float(process.get("saltMgL", 0) or 0)
    water = float(process.get("waterAfterElou", 0) or 0)
    if salt > 5 or water > 0.15:
        add_finding(
            "QUALITY-ELOU",
            "critical" if salt > 10 or water > 0.3 else "warning",
            "Не достигнуто качество обессоливания",
            f"Финальные значения: соли {salt:.2f} мг/л, вода {water:.3f}%.",
            "Отработать совместное влияние промывной воды, деэмульгатора и электрического поля.",
            "MT-ELOU-02",
            "elou-quality",
        )
    else:
        strengths.append(f"Качество после ЭЛОУ стабилизировано: соли {salt:.2f} мг/л, вода {water:.3f}%.")

    feed = float(process.get("feedFlow", 0) or 0)
    if feed < 300:
        add_finding(
            "FEED-LOW",
            "warning",
            "Недостаточная подача сырья",
            f"Расход сырья к завершению составил {feed:.1f} м³/ч.",
            "Повторить безопасную последовательность открытия тракта и пуска сырьевого насоса.",
            "MT-FEED-02",
            "feed-pumps",
        )
    elif feed >= 650:
        strengths.append(f"Подача сырья выведена в рабочий диапазон: {feed:.1f} м³/ч.")

    k1_pressure = float(process.get("pressureK1", 0) or 0)
    if k1_pressure >= 4.0:
        add_finding(
            "K1-PRESSURE",
            "critical" if k1_pressure >= 4.5 else "warning",
            "Высокое давление колонны К-1",
            f"Финальное давление К-1 — {k1_pressure:.2f} кгс/см².",
            "Отработать диагностику каналов охлаждения и безопасную разгрузку К-1.",
            "MT-K1-01",
            "k1-control",
        )

    k1_level = float(process.get("levelK1", 50) or 0)
    if k1_level < 15:
        add_finding(
            "K1-LEVEL",
            "critical",
            "Низкий уровень куба К-1",
            f"Уровень К-1 снижен до {k1_level:.1f}%.",
            "Закрепить действия по защите печного тракта при потере уровня.",
            "MT-K1-02",
            "k1-low-level",
        )

    furnace = float(process.get("tempFurnaceOut", 0) or 0)
    if furnace > 380:
        add_finding(
            "FURNACE-TEMP",
            "critical",
            "Перегрев печного тракта",
            f"Средняя температура на выходе печей достигла {furnace:.1f} °C.",
            "Повторить стабилизацию расхода и топлива без риска перегрева змеевика.",
            "MT-FURN-01",
            "furnace-safety",
        )

    k2_pressure = float(process.get("pressureK2", 0) or 0)
    if k2_pressure >= 1.0:
        add_finding(
            "K2-PRESSURE",
            "critical" if k2_pressure >= 1.4 else "warning",
            "Высокое давление колонны К-2",
            f"Финальное давление К-2 — {k2_pressure:.2f} кгс/см².",
            "Отработать снижение тепловой нагрузки и восстановление охлаждения К-2.",
            "MT-K2-01",
            "k2-control",
        )

    k2_level = float(process.get("levelK2", 50) or 0)
    if k2_level < 15:
        add_finding(
            "K2-LEVEL",
            "critical",
            "Низкий уровень куба К-2",
            f"Уровень К-2 снижен до {k2_level:.1f}%.",
            "Повторить защиту печей и восстановление материального баланса К-2.",
            "MT-K2-02",
            "k2-low-level",
        )

    if process.get("instrumentAirOk") is False:
        add_finding(
            "UTILITY-AIR",
            "critical",
            "Не восстановлен приборный воздух",
            "К завершению сессии давление приборного воздуха оставалось ниже рабочего диапазона.",
            "Пройти точечную тренировку по диагностике и безопасному останову при потере воздуха КИП.",
            "MT-UTIL-01",
            "instrument-air",
        )

    if process.get("coolingWaterOk") is False:
        add_finding(
            "UTILITY-COOLING",
            "critical",
            "Не восстановлено охлаждение",
            "Оборотная вода оставалась недоступна к моменту завершения.",
            "Повторить безопасную реакцию на потерю охлаждения и разгрузку колонны.",
            "MT-SAFE-01",
            "cooling-loss",
        )

    gas = float(process.get("gasPercent", 0) or 0)
    if process.get("ventElouOk") is False or gas >= 20:
        add_finding(
            "VENT-GAS",
            "critical",
            "Риск загазованности при отказе вентиляции",
            f"Вентиляция ЭЛОУ: {'работает' if process.get('ventElouOk') else 'отказ'}; загазованность {gas:.1f}% НКПР.",
            "Отработать безопасную последовательность действий при отказе вентиляции.",
            "MT-VENT-01",
            "ventilation",
        )

    duplicate_actions = sum(
        1 for index in range(1, len(descriptions)) if descriptions[index] == descriptions[index - 1]
    )
    if penalty > 2 or duplicate_actions > 1:
        add_finding(
            "ACTION-SEQUENCE",
            "warning",
            "Избыточные или повторные действия",
            f"Штрафных действий: {penalty}; последовательных повторов: {duplicate_actions}.",
            "Перед воздействием сверять цель, текущее состояние и ожидаемый эффект команды.",
            "MT-FEED-01",
            "trainer-use",
        )
    elif descriptions:
        strengths.append("Последовательность действий не содержит выраженного числа повторных команд.")

    if max_pause_seconds > 90:
        add_finding(
            "ACTION-PAUSE",
            "warning",
            "Длительная пауза между действиями",
            f"Максимальный интервал между соседними действиями составил {max_pause_seconds:.1f} с.",
            "Повторить сценарий с проговариванием диагностической последовательности и контрольных точек.",
            "MT-FEED-01",
            "trainer-use",
        )

    if response_seconds is not None and float(response_seconds) > 60:
        add_finding(
            "RESPONSE-TIME",
            "warning",
            "Замедленная реакция на отклонение",
            f"Первое защитное действие выполнено через {float(response_seconds):.1f} с при ориентире 60 с.",
            "Повторить короткий аварийный сценарий до устойчивого выполнения без подсказки.",
            "MT-SAFE-01",
            "safety-actions",
        )
    elif response_seconds is not None:
        strengths.append(f"Защитная реакция выполнена за {float(response_seconds):.1f} с — в пределах ориентира.")

    rejected = [event for event in events if "отклон" in str(event.get("description", "")).casefold()]
    if rejected:
        findings.append(
            {
                "code": "REJECTED-COMMANDS",
                "severity": "info",
                "title": "Зафиксированы отклонённые команды",
                "evidence": f"Количество отклонённых или недоступных действий: {len(rejected)}.",
                "recommendation": "Проверить границы роли и разрешённые действия выбранного сегмента.",
                "trainingId": None,
                "articleId": "mini-training",
            }
        )

    if not findings and score >= 85:
        strengths.append("Сессия завершена без критических технологических отклонений.")
    if not recommendations and score < 85:
        recommendations.append(
            _recommendation("MT-ELOU-01", "process-overview", "Закрепить базовую причинно-следственную связь параметров процесса.")
        )

    critical_count = sum(item["severity"] == "critical" for item in findings)
    warning_count = sum(item["severity"] == "warning" for item in findings)
    if critical_count:
        level = "Требуется повторная отработка"
    elif warning_count or score < 75:
        level = "Нужно точечное закрепление"
    elif score < 90:
        level = "Результат устойчивый"
    else:
        level = "Высокая готовность"

    summary = (
        f"Выполнение — {score}%. Проанализировано действий: {len(actions)}, "
        f"системных событий: {len(events)}. "
        f"Критических отклонений: {critical_count}, зон внимания: {warning_count}."
    )
    return {
        "analysisId": f"analysis-{uuid.uuid4().hex[:12]}",
        "generatedAt": int(time.time() * 1000),
        "mode": "local-explainable-analysis",
        "overallLevel": level,
        "summary": summary,
        "metrics": {
            "scorePercent": score,
            "actionsCount": len(actions),
            "eventsCount": len(events),
            "criticalCount": critical_count,
            "warningCount": warning_count,
            "duplicateActions": duplicate_actions,
            "durationSeconds": round(duration_seconds, 1),
            "maxPauseSeconds": round(max_pause_seconds, 1),
            "controlAreasCount": len(control_areas),
        },
        "trajectory": trajectory[-30:],
        "controlAreas": control_areas,
        "strengths": strengths[:5],
        "findings": findings,
        "recommendations": recommendations[:4],
        "disclaimer": "Рекомендации относятся к учебной модели КТК и не заменяют производственный регламент.",
    }


def _ollama_answer(message: str, articles: list[dict[str, Any]], context: dict[str, Any]) -> str | None:
    provider = os.getenv("KTK_AI_PROVIDER", "rules").casefold()
    if provider not in {"ollama", "auto"}:
        return None
    model = os.getenv("KTK_OLLAMA_MODEL", "qwen3:4b-instruct")
    base_url = os.getenv("KTK_OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/")
    sources = "\n\n".join(
        f"[{article['id']}] {article['title']}\n{article['summary']}\n" + "\n".join(article["content"])
        for article in articles
    )
    system = (
        "Ты локальный учебный ассистент КТК ЭЛОУ-АВТ. Отвечай только по переданным "
        "материалам и состоянию учебной симуляции. Не выдавай команды для реальной установки. "
        "Если данных недостаточно, скажи об этом. В конце укажи идентификаторы источников."
    )
    body = json.dumps(
        {
            "model": model,
            "stream": False,
            "messages": [
                {"role": "system", "content": system},
                {
                    "role": "user",
                    "content": f"Контекст симуляции: {json.dumps(context, ensure_ascii=False)}\n\nМатериалы:\n{sources}\n\nВопрос: {message}",
                },
            ],
            "options": {"temperature": 0.2},
        },
        ensure_ascii=False,
    ).encode("utf-8")
    try:
        request = Request(f"{base_url}/api/chat", data=body, method="POST", headers={"Content-Type": "application/json"})
        with urlopen(request, timeout=25) as response:
            data = json.loads(response.read().decode("utf-8"))
        return str(data.get("message", {}).get("content", "")).strip() or None
    except (OSError, URLError, ValueError, TimeoutError):
        return None


def answer_question(payload: dict[str, Any]) -> dict[str, Any]:
    message = str(payload.get("message", "")).strip()
    if not message:
        raise ValueError("Введите вопрос")
    context = payload.get("context") or {}
    articles = search_articles(message)
    ollama = _ollama_answer(message, articles, context)
    if ollama:
        answer = ollama
        mode = "local-ollama-rag"
    else:
        lead = articles[0]
        paragraphs = lead["content"][:2]
        answer = f"{lead['summary']}\n\n" + "\n\n".join(paragraphs)
        process = context.get("process") or {}
        alerts: list[str] = []
        if float(process.get("pressureK1", 0) or 0) >= 4.0:
            alerts.append("В текущей симуляции повышено давление К-1.")
        if float(process.get("gasPercent", 0) or 0) >= 20:
            alerts.append("В текущей симуляции зафиксирована загазованность выше 20% НКПР.")
        if process.get("coolingWaterOk") is False:
            alerts.append("В текущей симуляции недоступна оборотная вода.")
        if alerts:
            answer = " ".join(alerts) + "\n\n" + answer
        answer += "\n\nОтвет сформирован для учебной модели. Сверяйте действия с регламентом занятия."
        mode = "local-knowledge-rag"

    related: list[dict[str, Any]] = []
    used_training: set[str] = set()
    for article in articles:
        training_id = ARTICLE_TRAININGS.get(article["id"])
        if training_id and training_id not in used_training:
            training = TRAINING_BY_ID[training_id]
            related.append(
                {
                    "trainingId": training_id,
                    "trainingTitle": training["title"],
                    "segment": training["segment"],
                }
            )
            used_training.add(training_id)
    return {
        "messageId": f"msg-{uuid.uuid4().hex[:12]}",
        "answer": answer,
        "mode": mode,
        "sources": [
            {"articleId": article["id"], "title": article["title"], "category": article["category"]}
            for article in articles[:3]
        ],
        "relatedTrainings": related[:3],
    }
