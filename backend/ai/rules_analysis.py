from __future__ import annotations

import json
import time
import uuid
from pathlib import Path
from typing import Any

from backend.knowledge.catalog import load_articles

ROOT = Path(__file__).resolve().parents[2]
TRAININGS = json.loads(
    (ROOT / "frontend" / "trainer" / "src" / "training" / "catalog.json").read_text(
        encoding="utf-8"
    )
)
ARTICLES = load_articles()
TRAINING_BY_ID = {item["id"]: item for item in TRAININGS}
ARTICLE_BY_ID = {item["id"]: item for item in ARTICLES}


def _recommendation(training_id: str, article_id: str, reason: str) -> dict[str, Any]:
    training = TRAINING_BY_ID.get(training_id) or {}
    article = ARTICLE_BY_ID.get(article_id) or {}
    return {
        "trainingId": training_id,
        "trainingTitle": training.get("title", ""),
        "segment": training.get("segment", ""),
        "durationMinutes": training.get("durationMinutes", 0),
        "reason": reason,
        "articleId": article_id,
        "articleTitle": article.get("title", ""),
    }


def analyze_session_rules(payload: dict[str, Any]) -> dict[str, Any]:
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
            "cooling-loss",
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

