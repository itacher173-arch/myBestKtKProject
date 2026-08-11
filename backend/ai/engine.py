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

from backend.knowledge.catalog import flatten_article, load_articles

ROOT = Path(__file__).resolve().parents[2]
MODELS_DIR = Path(__file__).resolve().parent / "models"
ACTION_MODEL_PATH = MODELS_DIR / "action_error_classifier.joblib"
RISK_MODEL_PATH = MODELS_DIR / "risk_predictor.joblib"

_action_model_bundle: dict[str, Any] | None = None
_risk_model_bundle: dict[str, Any] | None = None
_ml_unavailable_reason: str | None = None

try:
    import joblib
    import pandas as pd
except ImportError as exc:  # pragma: no cover - optional until deps installed
    joblib = None  # type: ignore[assignment]
    pd = None  # type: ignore[assignment]
    _ml_unavailable_reason = f"ML-зависимости не установлены: {exc}"

TRAININGS = json.loads(
    (ROOT / "frontend" / "trainer" / "src" / "training" / "catalog.json").read_text(
        encoding="utf-8"
    )
)
ARTICLES = load_articles()
TRAINING_BY_ID = {item["id"]: item for item in TRAININGS}
ARTICLE_BY_ID = {item["id"]: item for item in ARTICLES}

STOP_WORDS = {
    "как", "что", "это", "при", "для", "или", "где", "когда", "какой", "какая",
    "какие", "нужно", "надо", "можно", "почему", "если", "после", "перед", "через",
    "the", "and", "how", "what", "with", "from",
}

TRAINING_ARTICLE_MAP = {
    "MT-FEED-01": "feed-system",
    "MT-FEED-02": "feed-pumps",
    "MT-ELOU-01": "elou-principle",
    "MT-ELOU-02": "elou-quality",
    "MT-E1-01": "e1-water",
    "MT-K1-01": "k1-control",
    "MT-K1-02": "k1-low-level",
    "MT-FURN-01": "furnace-safety",
    "MT-K2-01": "k2-control",
    "MT-K2-02": "k2-low-level",
    "MT-UTIL-01": "instrument-air",
    "MT-VENT-01": "ventilation",
    "MT-SAFE-01": "cooling-loss",
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

def ml_available() -> bool:
    return (
        _ml_unavailable_reason is None
        and joblib is not None
        and pd is not None
        and ACTION_MODEL_PATH.exists()
        and RISK_MODEL_PATH.exists()
    )


def ml_status() -> dict[str, Any]:
    return {
        "available": ml_available(),
        "reason": _ml_unavailable_reason,
        "actionModel": ACTION_MODEL_PATH.exists(),
        "riskModel": RISK_MODEL_PATH.exists(),
    }


def _load_action_model() -> dict[str, Any]:
    global _action_model_bundle, _ml_unavailable_reason

    if _ml_unavailable_reason:
        raise RuntimeError(_ml_unavailable_reason)
    if joblib is None:
        raise RuntimeError("joblib недоступен")
    if _action_model_bundle is None:
        if not ACTION_MODEL_PATH.exists():
            raise RuntimeError(
                "Не найдена ML-модель классификации ошибок: "
                f"{ACTION_MODEL_PATH}"
            )
        try:
            _action_model_bundle = joblib.load(ACTION_MODEL_PATH)
        except Exception as exc:  # noqa: BLE001
            _ml_unavailable_reason = f"Не удалось загрузить action-модель: {exc}"
            raise RuntimeError(_ml_unavailable_reason) from exc

    return _action_model_bundle


def _load_risk_model() -> dict[str, Any]:
    global _risk_model_bundle, _ml_unavailable_reason

    if _ml_unavailable_reason:
        raise RuntimeError(_ml_unavailable_reason)
    if joblib is None:
        raise RuntimeError("joblib недоступен")
    if _risk_model_bundle is None:
        if not RISK_MODEL_PATH.exists():
            raise RuntimeError(
                "Не найдена ML-модель прогнозирования риска: "
                f"{RISK_MODEL_PATH}"
            )
        try:
            _risk_model_bundle = joblib.load(RISK_MODEL_PATH)
        except Exception as exc:  # noqa: BLE001
            _ml_unavailable_reason = f"Не удалось загрузить risk-модель: {exc}"
            raise RuntimeError(_ml_unavailable_reason) from exc

    return _risk_model_bundle

ERROR_PROFILES = {
    "NORMAL": {
        "severity": "info",
        "title": "Корректное операторское действие",
        "zone": "Операторское управление",
        "equipment": [],
        "explanation": (
            "ML-модель не выявила признаков ошибки в команде и состоянии "
            "учебного процесса."
        ),
        "recommendation": "Продолжайте контролировать динамику параметров процесса.",
        "trainingId": None,
    },
    "SEQUENCE_ERROR": {
        "severity": "warning",
        "title": "Нарушена последовательность действий",
        "zone": "Операторское управление",
        "equipment": [],
        "explanation": (
            "ML-модель выявила, что команда выполнена не в ожидаемом "
            "порядке относительно предыдущего действия и состояния процесса."
        ),
        "recommendation": (
            "Повторить целевую тренировку с подсказками, соблюдая "
            "последовательность диагностических и управляющих действий."
        ),
        "trainingId": "MT-FEED-01",
    },
    "RESPONSE_TIME_ERROR": {
        "severity": "warning",
        "title": "Превышено время реакции на отклонение",
        "zone": "Операторское управление",
        "equipment": [],
        "explanation": (
            "ML-модель выявила длительную паузу или замедленную реакцию "
            "на учебное технологическое отклонение."
        ),
        "recommendation": (
            "Пройти короткий аварийный сценарий до устойчивого выполнения "
            "действий без подсказок."
        ),
        "trainingId": "MT-SAFE-01",
    },
    "DUPLICATE_COMMAND": {
        "severity": "warning",
        "title": "Обнаружена повторная команда",
        "zone": "Операторское управление",
        "equipment": [],
        "explanation": (
            "ML-модель классифицировала действие как повторное воздействие "
            "без достаточной паузы для контроля результата."
        ),
        "recommendation": (
            "Перед повтором команды проверять изменение параметра, "
            "состояние оборудования и ожидаемый эффект воздействия."
        ),
        "trainingId": "MT-FEED-01",
    },
    "PARAMETER_ERROR": {
        "severity": "warning",
        "title": "Выбран небезопасный параметр управления",
        "zone": "Технологическое управление",
        "equipment": [],
        "explanation": (
            "ML-модель выявила сочетание команды и текущих параметров, "
            "характерное для ошибочного управляющего воздействия."
        ),
        "recommendation": (
            "Закрепить причинно-следственную связь между параметрами "
            "процесса и управляющим воздействием."
        ),
        "trainingId": "MT-FURN-01",
    },
    "EQUIPMENT_NOT_READY": {
        "severity": "warning",
        "title": "Оборудование или инженерная среда не подготовлены",
        "zone": "Оборудование и инженерные системы",
        "equipment": [],
        "explanation": (
            "ML-модель выявила попытку выполнения действия при признаках "
            "неготовности оборудования, питания, воздуха или охлаждения."
        ),
        "recommendation": (
            "Проверить готовность технологического тракта и инженерных "
            "сред перед повторением команды."
        ),
        "trainingId": "MT-UTIL-01",
    },
    "CRITICAL_OPERATION_ERROR": {
        "severity": "critical",
        "title": "Выявлено потенциально критическое действие",
        "zone": "Промышленная безопасность",
        "equipment": [],
        "explanation": (
            "ML-модель классифицировала сочетание команды и состояния "
            "процесса как потенциально критическое для учебной модели."
        ),
        "recommendation": (
            "Немедленно назначить повторную отработку с подсказками, "
            "после чего выполнить контрольный прогон без подсказок."
        ),
        "trainingId": "MT-SAFE-01",
    },
    "UNKNOWN": {
        "severity": "warning",
        "title": "Класс ошибки не распознан справочником интерпретации",
        "zone": "Операторское управление",
        "equipment": [],
        "explanation": (
            "ML-модель вернула метку класса, отсутствующую в ERROR_PROFILES. "
            "Скорее всего справочник не обновили после переобучения модели."
        ),
        "recommendation": (
            "Сообщить о несоответствии модели и словаря интерпретации "
            "администратору тренажёра; обновить ERROR_PROFILES."
        ),
        "trainingId": None,
    },
}

def _to_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default

def _action_from_description(description: str) -> tuple[str, float]:
    """
    Преобразует строку журнала simulator в action,
    использовавшийся при обучении модели.

    Это не классификация ошибки: здесь только нормализация
    формата данных из simulator для ML pipeline.
    """
    text = description.casefold().strip()

    if "насос n-1: start" in text or "запуск насоса н-1" in text:
        return "start-N1", 0.0
    if "насос n-2: start" in text or "запуск насоса н-2" in text:
        return "start-N2", 0.0
    if "насос n-3: start" in text or "запуск насоса н-3" in text:
        return "start-N3", 0.0
    if "насос n-1: stop" in text or "останов насоса н-1" in text:
        return "stop-N1", 0.0
    if "насос n-2: stop" in text or "останов насоса н-2" in text:
        return "stop-N2", 0.0
    if "задвижка l-1: open" in text or "открытие задвижки л-1" in text:
        return "open-L1", 100.0
    if "задвижка l-1: close" in text or "закрытие задвижки л-1" in text:
        return "close-L1", 0.0
    if "подача топливного газа:" in text or "топливный газ" in text:
        match = re.search(r"([0-9]+(?:[.,][0-9]+)?)", text)
        return "set-fuel", _to_float(match.group(1).replace(",", ".")) if match else 0.0
    if "инженерная среда coolingwaterok: true" in text or (
        "оборотн" in text and "восстанов" in text
    ):
        return "restore-cooling", 1.0
    if "инженерная среда ventelouok: true" in text or (
        "вентиляц" in text and "восстанов" in text
    ):
        return "restore-ventilation", 1.0
    if "защита уровня k-1" in text or "защита к-1" in text:
        return "protect-K1", 0.0
    if "защита уровня k-2" in text or "защита к-2" in text:
        return "protect-K2", 0.0
    if "electricfieldon: включено" in text or (
        "электрическ" in text and "включ" in text
    ):
        return "toggle-electric-field", 1.0
    if "electricfieldon: отключено" in text or (
        "электрическ" in text and "отключ" in text
    ):
        return "toggle-electric-field", 0.0
    if "demulsifier" in text or "деэмульгатор" in text:
        return "toggle-demulsifier", 1.0 if "включ" in text or "true" in text else 0.0
    if "washwater" in text or "промывн" in text:
        return "toggle-wash-water", 1.0 if "включ" in text or "true" in text else 0.0
    if "avofan" in text or "аво" in text or "авз" in text:
        return "set-avo-fan", 1.0
    if "дренирован" in text:
        return "drain-vessel", 0.0
    if "запущено упражнение" in text:
        return "check-process-state", 0.0

    return "unknown-action", 0.0

def _equipment_from_action(action_name: str) -> tuple[str, list[str]]:
    """
    Справочник локализации. Он переводит действие в зону и оборудование,
    но не определяет наличие/отсутствие ошибки — это делает ML-модель.
    """
    mapping = {
        "start-N1": ("Подача сырья", ["Л-1", "Н-1"]),
        "stop-N1": ("Подача сырья", ["Л-1", "Н-1"]),
        "open-L1": ("Подача сырья", ["Л-1"]),
        "close-L1": ("Подача сырья", ["Л-1"]),
        "open-L2": ("Ректификация", ["Л-2"]),
        "close-L2": ("Ректификация", ["Л-2"]),
        "open-L3": ("Ректификация", ["Л-3"]),
        "close-L3": ("Ректификация", ["Л-3"]),
        "start-N2": ("Печной тракт", ["Н-2", "П-1", "П-2", "П-3"]),
        "stop-N2": ("Печной тракт", ["Н-2", "П-1", "П-2", "П-3"]),
        "start-N3": ("Печной тракт", ["Н-3"]),
        "stop-N3": ("Печной тракт", ["Н-3"]),
        "set-fuel": ("Печной тракт", ["П-1", "П-2", "П-3"]),
        "restore-cooling": ("Охлаждение и ректификация", ["Оборотная вода", "К-1", "К-2"]),
        "disable-cooling": ("Охлаждение и ректификация", ["Оборотная вода", "К-1", "К-2"]),
        "restore-ventilation": ("ЭЛОУ и промышленная безопасность", ["Вентиляция ЭЛОУ"]),
        "disable-ventilation": ("ЭЛОУ и промышленная безопасность", ["Вентиляция ЭЛОУ"]),
        "set-steamOk": ("Инженерные системы", ["Пар"]),
        "set-powerOk": ("Инженерные системы", ["Электропитание"]),
        "set-ventOpsOk": ("Инженерные системы", ["Вентиляция операторной"]),
        "set-instrumentAirOk": ("Инженерные системы", ["Приборный воздух"]),
        "protect-K1": ("Колонна К-1", ["К-1", "П-3", "П-4"]),
        "protect-K2": ("Колонна К-2", ["К-2", "П-1", "П-2"]),
        "toggle-electric-field": ("ЭЛОУ", ["Электрическое поле", "ЭЛОУ"]),
        "toggle-demulsifier": ("ЭЛОУ", ["Деэмульгатор", "ЭЛОУ"]),
        "toggle-wash-water": ("ЭЛОУ", ["Промывная вода", "ЭЛОУ"]),
        "set-avo-fan": ("Охлаждение", ["АВЗ"]),
        "set-level-setpoint-K1": ("Колонна К-1", ["К-1"]),
        "set-level-setpoint-K2": ("Колонна К-2", ["К-2"]),
        "drain-vessel": ("ЭЛОУ", ["E-1", "E-2"]),
    }
    return mapping.get(action_name, ("Операторское управление", []))

_CATEGORICAL_FEATURE_DEFAULTS = {
    "scenarioId": "UNKNOWN",
    "action": "unknown-action",
    "previousAction": "NONE",
    "candidateAction": "unknown-action",
    "expectedAction": "check-process-state",
}
_BOOLEAN_FEATURES = {"powerOk", "instrumentAirOk", "coolingWaterOk", "ventElouOk"}
_CATEGORICAL_COLUMNS = set(_CATEGORICAL_FEATURE_DEFAULTS)

def _frame_from_features(features: dict[str, Any], columns: list[str]) -> pd.DataFrame:
    row: dict[str, Any] = {}
    for column in columns:
        value = features.get(column)
        if value is None:
            if column in _CATEGORICAL_FEATURE_DEFAULTS:
                value = _CATEGORICAL_FEATURE_DEFAULTS[column]
            elif column in _BOOLEAN_FEATURES:
                value = False
            else:
                value = 0.0
        if column in _CATEGORICAL_COLUMNS or column in {
            "scenarioId",
            "action",
            "previousAction",
            "candidateAction",
            "expectedAction",
        }:
            value = str(value)
        elif column in _BOOLEAN_FEATURES:
            value = bool(value)
        else:
            value = _to_float(value, 0.0)
        row[column] = value
    return pd.DataFrame([row], columns=columns)

def _ml_action_features(
    *,
    process: dict[str, Any],
    action: dict[str, Any],
    previous_action_name: str,
    sequence_position: int,
    pause_seconds: float,
    response_seconds: float | None,
    duplicate_count: int,
    scenario_id: str,
) -> tuple[dict[str, Any], str]:
    description = str(action.get("description", ""))
    action_name, action_value = _action_from_description(description)
    expected_action = str(
        action.get("expectedAction")
        or process.get("expectedAction")
        or action_name
        or "check-process-state"
    )

    features = {
        "scenarioId": scenario_id or "UNKNOWN",
        "action": action_name,
        "previousAction": previous_action_name or "NONE",
        "expectedAction": expected_action,
        "sequencePosition": sequence_position,
        "responseSeconds": (
            _to_float(response_seconds, pause_seconds)
            if response_seconds is not None
            else pause_seconds
        ),
        "pauseSeconds": pause_seconds,
        "duplicateCount": duplicate_count,
        "actionValue": action_value,
        "valveL1": _to_float(process.get("valveL1")),
        "feedFlow": _to_float(process.get("feedFlow")),
        "pressureK1": _to_float(process.get("pressureK1")),
        "pressureK2": _to_float(process.get("pressureK2")),
        "levelK1": _to_float(process.get("levelK1"), 50.0),
        "levelK2": _to_float(process.get("levelK2"), 50.0),
        "temperatureFurnace": _to_float(process.get("tempFurnaceOut")),
        "gasPercent": _to_float(process.get("gasPercent")),
        "saltMgL": _to_float(process.get("saltMgL")),
        "waterAfterElou": _to_float(process.get("waterAfterElou")),
        "powerOk": bool(process.get("powerOk", True)),
        "instrumentAirOk": bool(process.get("instrumentAirOk", True)),
        "coolingWaterOk": bool(process.get("coolingWaterOk", True)),
        "ventElouOk": bool(process.get("ventElouOk", True)),
    }
    return features, action_name

def _classify_action_ml(
    features: dict[str, Any],
) -> tuple[str, float]:
    bundle = _load_action_model()
    pipeline = bundle["pipeline"]
    columns = bundle["features"]

    frame = _frame_from_features(features, columns)

    predicted_label = str(pipeline.predict(frame)[0])
    probabilities = pipeline.predict_proba(frame)[0]
    classes = [str(item) for item in pipeline.named_steps["model"].classes_]

    if predicted_label not in classes:
        return predicted_label, 0.0
    probability = float(probabilities[classes.index(predicted_label)])
    return predicted_label, probability

def localize_operator_errors_ml(
    *,
    process: dict[str, Any],
    actions: list[dict[str, Any]],
    scenario_id: str,
    response_seconds: float | None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """
    Классифицирует каждое действие ML-моделью.
    Возвращает:
    1. ошибки для обратной связи;
    2. все прогнозы модели, включая NORMAL — для аудита.
    """
    errors: list[dict[str, Any]] = []
    predictions: list[dict[str, Any]] = []

    previous_action_name = "NONE"
    previous_description = ""
    previous_at: int | None = None

    for sequence, item in enumerate(actions, start=1):
        description = str(item.get("description", "")).strip()
        current_at = int(item.get("at", 0) or 0)
        pause_seconds = (
            max(0.0, (current_at - previous_at) / 1000)
            if previous_at is not None and current_at
            else 0.0
        )
        duplicate_count = int(
            bool(description and description == previous_description)
        )

        features, action_name = _ml_action_features(
            process=process,
            action=item,
            previous_action_name=previous_action_name,
            sequence_position=sequence,
            pause_seconds=pause_seconds,
            response_seconds=response_seconds,
            duplicate_count=duplicate_count,
            scenario_id=scenario_id,
        )

        label, probability = _classify_action_ml(features)
        zone, equipment = _equipment_from_action(action_name)
        profile = ERROR_PROFILES.get(label, ERROR_PROFILES["UNKNOWN"])

        prediction = {
            "sequence": sequence,
            "at": current_at,
            "description": description,
            "action": action_name,
            "label": label,
            "confidence": round(probability, 4),
            "location": {
                "zone": zone,
                "equipment": equipment,
            },
        }
        predictions.append(prediction)

        if label != "NORMAL":
            errors.append(
                {
                    "code": f"ML-{label}",
                    "severity": profile["severity"],
                    "title": profile["title"],
                    "classification": {
                        "label": label,
                        "confidence": round(probability, 4),
                        "model": "action_error_classifier.joblib",
                    },
                    "location": {
                        "zone": zone,
                        "equipment": equipment,
                    },
                    "timeline": {
                        "sequence": sequence,
                        "at": current_at,
                    },
                    "operatorAction": description,
                    "expectedAction": (
                        "Выполнить действие в безопасной последовательности "
                        "с учётом текущего состояния процесса."
                    ),
                    "explanation": profile["explanation"],
                    "recommendation": profile["recommendation"],
                    "trainingId": profile["trainingId"],
                }
            )

        previous_action_name = action_name
        previous_description = description
        previous_at = current_at or previous_at

    return errors, predictions

def build_adaptive_plan(
    *,
    localized_errors: list[dict[str, Any]],
    scenario_id: str,
    score_percent: int,
) -> dict[str, Any]:
    """
    Формирует персональный маршрут повторного обучения
    по результатам ML-классификации ошибок.
    """
    critical_errors = [
        item for item in localized_errors
        if item.get("severity") == "critical"
    ]
    warning_errors = [
        item for item in localized_errors
        if item.get("severity") == "warning"
    ]

    retraining_required = bool(critical_errors) or len(warning_errors) >= 2 or score_percent < 75

    if critical_errors:
        decision_level = "mandatory"
        decision_reason = (
            "ML-модель выявила потенциально критическое действие. "
            "Повторная отработка обязательна."
        )
    elif len(warning_errors) >= 2:
        decision_level = "targeted"
        decision_reason = (
            "ML-модель выявила несколько ошибок оператора. "
            "Необходимо точечное закрепление навыков."
        )
    elif warning_errors or score_percent < 85:
        decision_level = "recommended"
        decision_reason = (
            "Критических ошибок не выявлено, но отдельные навыки "
            "рекомендуется закрепить."
        )
    else:
        decision_level = "not_required"
        decision_reason = (
            "ML-модель не выявила ошибок, требующих повторного обучения."
        )

    plan: list[dict[str, Any]] = []
    used_trainings: set[str] = set()

    def add_step(
        training_id: str | None,
        mode: str,
        hints_enabled: bool,
        reason: str,
        source_error: str | None,
    ) -> None:
        if not training_id or training_id in used_trainings:
            return

        training = TRAINING_BY_ID.get(training_id)
        if not training:
            return

        plan.append(
            {
                "step": len(plan) + 1,
                "trainingId": training_id,
                "trainingTitle": training["title"],
                "segment": training.get("segment"),
                "difficulty": training.get("difficulty"),
                "durationMinutes": training.get("durationMinutes"),
                "mode": mode,
                "hintsEnabled": hints_enabled,
                "reason": reason,
                "sourceErrorClass": source_error,
                "objectives": training.get("objectives", []),
                "successCriteria": training.get("criteria", []),
            }
        )
        used_trainings.add(training_id)

    for error in critical_errors:
        add_step(
            training_id=error.get("trainingId"),
            mode="guided",
            hints_enabled=True,
            reason=str(error.get("recommendation", "")),
            source_error=str(error.get("classification", {}).get("label", "")),
        )

    for error in warning_errors:
        add_step(
            training_id=error.get("trainingId"),
            mode="targeted",
            hints_enabled=True,
            reason=str(error.get("recommendation", "")),
            source_error=str(error.get("classification", {}).get("label", "")),
        )

    control_scenario = None
    if retraining_required:
        control_scenario = {
            "scenarioId": scenario_id,
            "mode": "control",
            "hintsEnabled": False,
            "reason": (
                "После прохождения целевых мини-тренировок повторите исходный "
                "сценарий без подсказок для проверки устойчивости навыка."
            ),
        }

    return {
        "retrainingRequired": retraining_required,
        "retrainingDecision": {
            "level": decision_level,
            "reason": decision_reason,
            "criticalMlErrors": len(critical_errors),
            "warningMlErrors": len(warning_errors),
        },
        "adaptivePlan": plan,
        "controlScenario": control_scenario,
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
        keywords = _tokens(" ".join(article.get("keywords", [])))
        summary = _tokens(article["summary"])
        content = _tokens(" ".join(flatten_article(article) or article.get("content", [])))
        score = (
            len(query_tokens & title) * 8
            + len(query_tokens & keywords) * 6
            + len(query_tokens & summary) * 3
            + len(query_tokens & content)
        )
        if score:
            scored.append((score, article))
    if not scored:
        fallback_ids = [aid for aid in ("process-overview", "trainer-use") if aid in ARTICLE_BY_ID]
        scored = [(1, ARTICLE_BY_ID[aid]) for aid in fallback_ids]
        if not scored and ARTICLES:
            scored = [(1, ARTICLES[0])]
    scored.sort(key=lambda item: (-item[0], item[1]["title"]))
    return [article for _, article in scored[:limit]]

def _recommendation(training_id: str, article_id: str, reason: str) -> dict[str, Any]:
    training = TRAINING_BY_ID.get(training_id)
    article = ARTICLE_BY_ID.get(article_id)
    if not training:
        return {
            "trainingId": training_id,
            "trainingTitle": "",
            "segment": "",
            "durationMinutes": 0,
            "reason": reason,
            "articleId": article_id,
            "articleTitle": article["title"] if article else "",
        }
    return {
        "trainingId": training_id,
        "trainingTitle": training["title"],
        "segment": training.get("segment", ""),
        "durationMinutes": training.get("durationMinutes", 0),
        "reason": reason,
        "articleId": article_id,
        "articleTitle": article["title"] if article else "",
    }

def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default

def _severity_rank(severity: str) -> int:
    return {"critical": 3, "warning": 2, "info": 1}.get(
        str(severity).casefold(), 0
    )

def _operator_history(payload: dict[str, Any]) -> list[dict[str, Any]]:
    """
    История учебных сессий оператора.
    Если storage ещё не передаёт историю, анализ корректно работает
    только по текущей сессии.
    Поддерживаются оба распространённых варианта:
      operatorHistory: [...]
      reports: [...]
    """
    history = payload.get("operatorHistory")
    if history is None:
        history = payload.get("reports")
    if not isinstance(history, list):
        return []
    return [item for item in history if isinstance(item, dict)]

def _build_operator_behavior(
    actions: list[dict[str, Any]],
    response_seconds: Any,
) -> dict[str, Any]:
    """
    Выделяет поведенческие признаки, которые можно использовать
    и в обратной связи, и в прогнозе риска.
    """
    timestamps = [
        int(item.get("at", 0) or 0)
        for item in actions
        if int(item.get("at", 0) or 0) > 0
    ]

    gaps = [
        max(0.0, (right - left) / 1000)
        for left, right in zip(timestamps, timestamps[1:])
    ]

    descriptions = [
        str(item.get("description", "")).strip()
        for item in actions
    ]
    descriptions = [item for item in descriptions if item]

    duplicate_count = sum(
        1
        for left, right in zip(descriptions, descriptions[1:])
        if left == right
    )

    long_pauses = sum(1 for gap in gaps if gap > 60)
    max_gap = max(gaps, default=0.0)

    reaction = (
        _safe_float(response_seconds, 0.0)
        if response_seconds is not None
        else None
    )

    signals: list[str] = []

    if duplicate_count:
        signals.append(
            f"повторные команды подряд: {duplicate_count}"
        )

    if long_pauses:
        signals.append(
            f"длинные паузы >60 с: {long_pauses}"
        )

    if reaction is not None and reaction > 60:
        signals.append(
            f"время защитной реакции: {reaction:.1f} с"
        )

    if not signals:
        signals.append("выраженных поведенческих отклонений не выявлено")

    if duplicate_count >= 2 or (
        reaction is not None and reaction > 90
    ):
        behavior_level = "high"
    elif duplicate_count or (
        reaction is not None and reaction > 60
    ) or max_gap > 60:
        behavior_level = "medium"
    else:
        behavior_level = "low"

    return {
        "level": behavior_level,
        "actionsAnalyzed": len(actions),
        "duplicateCommands": duplicate_count,
        "longPauses": long_pauses,
        "maxPauseSeconds": round(max_gap, 1),
        "responseSeconds": (
            round(reaction, 1)
            if reaction is not None
            else None
        ),
        "signals": signals[:5],
    }

def _build_operator_profile(
    payload: dict[str, Any],
    current_analysis: dict[str, Any],
) -> dict[str, Any]:
    """
    Профиль строится из переданной истории.
    Это намеренно не создаёт скрытого подключения к БД:
    источник истории остаётся за storage/frontend.
    """
    operator = str(
        payload.get("userName")
        or payload.get("operatorName")
        or ""
    ).strip()

    history = _operator_history(payload)

    if not operator:
        return {
            "operator": None,
            "sessions": 0,
            "averageScore": None,
            "averageResponseSeconds": None,
            "recurrentErrors": [],
            "trend": "unknown",
            "currentSessionIncluded": True,
        }

    scores: list[float] = []
    responses: list[float] = []
    errors: dict[str, int] = {}

    for report in history:
        name = str(
            report.get("userName")
            or report.get("operatorName")
            or ""
        ).strip()

        if name and name != operator:
            continue

        score = report.get("scorePercent")
        if score is not None:
            scores.append(_safe_float(score))

        reaction = report.get("responseSeconds")
        if reaction is not None:
            responses.append(_safe_float(reaction))

        analysis = report.get("aiAnalysis") or {}
        if isinstance(analysis, dict):
            candidates = analysis.get("findings") or analysis.get("localizedErrors") or []
            for item in candidates:
                if not isinstance(item, dict):
                    continue
                code = item.get("code")
                if code:
                    code = str(code)
                    errors[code] = errors.get(code, 0) + 1

    current_errors = current_analysis.get("findings") or current_analysis.get("localizedErrors") or []

    for item in current_errors:
        if not isinstance(item, dict):
            continue
        code = item.get("code")
        if code:
            code = str(code)
            errors[code] = errors.get(code, 0) + 1

    current_score = _safe_float(
        (current_analysis.get("metrics") or {}).get(
            "scorePercent",
            payload.get("scorePercent", 0),
        )
    )
    scores.append(current_score)

    current_response = payload.get("responseSeconds")
    if current_response is not None:
        responses.append(_safe_float(current_response))

    recurrent = [
        {"code": code, "count": count}
        for code, count in sorted(
            errors.items(),
            key=lambda pair: (-pair[1], pair[0]),
        )[:10]
    ]

    trend = "stable"
    if len(scores) >= 3:
        recent = sum(scores[-2:]) / 2
        previous = scores[-3]
        delta = recent - previous
        if delta >= 5:
            trend = "improving"
        elif delta <= -5:
            trend = "declining"

    return {
        "operator": operator,
        "sessions": len(history) + 1,
        "averageScore": round(sum(scores) / len(scores), 1),
        "averageResponseSeconds": (
            round(sum(responses) / len(responses), 1)
            if responses else None
        ),
        "recurrentErrors": recurrent,
        "trend": trend,
        "currentSessionIncluded": True,
    }

def _build_adaptive_training(
    findings: list[dict[str, Any]],
    localized_errors: list[dict[str, Any]],
    recommendations: list[dict[str, Any]],
    operator_profile: dict[str, Any],
) -> dict[str, Any]:
    """
    Выбирает одну приоритетную точку повторного обучения.
    Приоритет = критичность + повторяемость + наличие локализованной ошибки.

    Бага 9 (продолжение): раньше вызывающий код передавал сюда один и тот
    же список и как `findings`, и как `localized_errors`, из-за чего
    `for item in findings + localized_errors` дважды перебирал каждую
    ошибку (удваивая её вес) и бонус "+5 если item in localized_errors"
    был бессмысленным (срабатывал всегда). Теперь `findings` — это
    консолидированный список (ML-ошибки + находки по systemEvents),
    а `localized_errors` — подмножество именно ML-локализованных ошибок,
    так что перебираем только `findings`, а бонус действительно отличает
    ML-локализованные ошибки от прочих находок.
    """
    candidates: list[dict[str, Any]] = []

    for item in findings:
        if not isinstance(item, dict):
            continue
        code = item.get("code")
        if not code:
            continue

        previous_count = 0
        for previous in operator_profile.get("recurrentErrors", []):
            if previous.get("code") == code:
                previous_count = int(previous.get("count", 0))
                break

        priority = (
            _severity_rank(str(item.get("severity", "info"))) * 10
            + min(previous_count, 5) * 3
            + (5 if item in localized_errors else 0)
        )

        candidates.append(
            {
                "priority": priority,
                "item": item,
                "previousOccurrences": previous_count,
            }
        )

    if not candidates:
        return {
            "decision": "advance",
            "trainingId": None,
            "reason": "Ошибок, требующих отдельной отработки, не выявлено.",
            "difficulty": 2,
            "successCriteria": {
                "maxCriticalErrors": 0,
                "requiredAttempts": 1,
                "maxResponseSeconds": 60,
            },
        }

    candidates.sort(
        key=lambda item: item["priority"],
        reverse=True,
    )
    selected = candidates[0]
    item = selected["item"]
    code = str(item.get("code"))
    training_id = item.get("trainingId")

    if not training_id:
        for recommendation in recommendations:
            if recommendation.get("trainingId"):
                training_id = recommendation["trainingId"]
                break

    previous_occurrences = int(
        selected["previousOccurrences"]
    )
    critical = (
        str(item.get("severity", "")).casefold() == "critical"
    )
    repeated = previous_occurrences >= 2

    if critical or repeated:
        decision = "repeat_training"
        difficulty = 1
        attempts = 2
        max_response = 45
    elif item.get("severity") == "warning":
        decision = "reinforcement"
        difficulty = 2
        attempts = 1
        max_response = 60
    else:
        decision = "reinforcement"
        difficulty = 2
        attempts = 1
        max_response = 60

    title = str(
        item.get("title")
        or item.get("primaryErrorTitle")
        or code
    )

    reason_parts = [
        f"Приоритетная зона: {title}.",
    ]

    if previous_occurrences:
        reason_parts.append(
            f"Ошибка уже встречалась {previous_occurrences} раз."
        )

    if critical:
        reason_parts.append(
            "Ошибка критическая, поэтому назначена повторная отработка."
        )
    elif repeated:
        reason_parts.append(
            "Повторяемость ошибки указывает на неустойчивый навык."
        )

    return {
        "decision": decision,
        "trainingId": training_id,
        "trainingTitle": (
            TRAINING_BY_ID.get(str(training_id), {}).get("title")
            if training_id
            else None
        ),
        "primaryErrorCode": code,
        "primaryErrorTitle": title,
        "previousOccurrences": previous_occurrences,
        "reason": " ".join(reason_parts),
        "difficulty": difficulty,
        "successCriteria": {
            "maxCriticalErrors": 0,
            "requiredAttempts": attempts,
            "maxResponseSeconds": max_response,
        },
    }

def _build_instructor_decision(
    metrics: dict[str, Any],
    operator_profile: dict[str, Any],
    adaptive_training: dict[str, Any],
    findings: list[dict[str, Any]],
    localized_errors: list[dict[str, Any]],
    operator_behavior: dict[str, Any] | None = None,
) -> dict[str, Any]:
    critical_count = int(metrics.get("criticalCount", 0))
    warning_count = int(metrics.get("warningCount", 0))
    score = int(metrics.get("scorePercent", 0))

    reasons: list[str] = []

    if critical_count:
        reasons.append(
            f"Выявлено критических отклонений: {critical_count}."
        )

    if adaptive_training.get("previousOccurrences", 0) >= 2:
        reasons.append(
            "Основная ошибка повторяется в истории обучения оператора."
        )

    if score < 75:
        reasons.append(
            f"Итоговая оценка {score}% ниже порога устойчивого выполнения."
        )

    if warning_count:
        reasons.append(
            f"Выявлено зон внимания: {warning_count}."
        )

    if operator_behavior and operator_behavior.get("level") == "high":
        reasons.append(
            "Поведенческие признаки (повторы команд / медленная реакция) "
            "указывают на неустойчивое выполнение сценария."
        )

    critical_localized = any(
        str(item.get("severity", "")).casefold() == "critical"
        for item in localized_errors
        if isinstance(item, dict)
    )

    if critical_count or critical_localized:
        decision = "RETRAIN"
        ready = False
        repeat_required = True
    elif adaptive_training.get("decision") == "repeat_training":
        decision = "RETRAIN"
        ready = False
        repeat_required = True
    elif warning_count or score < 85:
        decision = "REINFORCEMENT"
        ready = True
        repeat_required = False
    else:
        decision = "PASS"
        ready = True
        repeat_required = False

    if not reasons:
        reasons.append(
            "Критических отклонений и повторяющихся проблем не выявлено."
        )

    return {
        "decision": decision,
        "readyForNextScenario": ready,
        "repeatTrainingRequired": repeat_required,
        "reasons": reasons[:5],
        "operatorTrend": operator_profile.get("trend"),
        "operatorSessions": operator_profile.get("sessions", 0),
        "adaptiveTraining": adaptive_training,
        "evidence": {
            "criticalFindings": [
                item.get("code")
                for item in findings
                if isinstance(item, dict)
                and str(item.get("severity", "")).casefold() == "critical"
            ],
            "localizedErrors": [
                item.get("code")
                for item in localized_errors
                if isinstance(item, dict)
            ],
        },
    }

def _analyze_system_events(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Разбирает системные события (отклонённые команды, автоматические
    защиты и т.п.), которые не проходят через ML-классификатор действий,
    но важны для обратной связи оператору.
    """
    findings: list[dict[str, Any]] = []

    rejected = [
        event for event in events
        if "отклон" in str(event.get("description", "")).casefold()
    ]
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

    auto_protection = [
        event for event in events
        if any(
            token in str(event.get("description", "")).casefold()
            for token in ("esd", "защита сработала", "автоматическ", "sc-1")
        )
    ]
    if auto_protection:
        findings.append(
            {
                "code": "AUTO-PROTECTION-TRIGGERED",
                "severity": "warning",
                "title": "Сработала автоматическая защита процесса",
                "evidence": f"Количество событий автоматической защиты: {len(auto_protection)}.",
                "recommendation": "Разобрать хронологию событий и отработать более раннее ручное вмешательство.",
                "trainingId": "MT-SAFE-01",
                "articleId": "cooling-loss",
            }
        )

    return findings

def _debrief_context(analysis: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    """
    Компактный контекст для LLM/шаблона: только то, что нужно для связного
    текста. Намеренно не отдаём весь analysis целиком — это и экономит
    контекст маленькой локальной модели, и не даёт ей "цитировать" служебные
    внутренние поля (id моделей, uuid анализа и т.п.).
    """
    instructor_decision = analysis.get("instructorDecision") or {}
    adaptive_training = analysis.get("adaptiveTraining") or {}
    operator_profile = analysis.get("operatorProfile") or {}

    return {
        "operatorName": str(
            payload.get("userName") or payload.get("operatorName") or ""
        ).strip() or "Оператор",
        "scenarioId": analysis.get("scenarioId"),
        "overallLevel": analysis.get("overallLevel"),
        "scorePercent": (analysis.get("metrics") or {}).get("scorePercent"),
        "strengths": (analysis.get("strengths") or [])[:3],
        "findings": [
            {
                "title": item.get("title"),
                "severity": item.get("severity"),
                "evidence": item.get("evidence") or item.get("explanation"),
            }
            for item in (analysis.get("findings") or [])[:5]
            if isinstance(item, dict) and item.get("title")
        ],
        "instructorDecision": {
            "decision": instructor_decision.get("decision"),
            "reasons": (instructor_decision.get("reasons") or [])[:3],
        },
        "adaptiveTraining": {
            "trainingTitle": adaptive_training.get("trainingTitle"),
            "reason": adaptive_training.get("reason"),
        },
        "operatorTrend": operator_profile.get("trend"),
        "operatorSessions": operator_profile.get("sessions"),
    }

def _ollama_debrief(context: dict[str, Any]) -> str | None:
    provider = os.getenv("KTK_AI_PROVIDER", "rules").casefold()
    if provider not in {"ollama", "auto"}:
        return None
    model = os.getenv("KTK_OLLAMA_MODEL", "qwen3:4b-instruct")
    base_url = os.getenv("KTK_OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/")
    system = (
        "Ты инструктор учебного тренажёра КТК ЭЛОУ-АВТ. По присланным в "
        "формате JSON результатам анализа учебной сессии напиши связный "
        "разбор для обучаемого на русском языке, 150-220 слов, 2-4 абзаца, "
        "простым разговорным языком, без списков и markdown-разметки. "
        "Используй только факты из присланных данных — ничего не "
        "придумывай и не добавляй числа, которых там нет. Сначала кратко "
        "отметь, что получилось хорошо (если есть сильные стороны), затем "
        "разбери основные замечания с опорой на конкретные зоны или "
        "параметры, в конце объясни итоговое решение инструктора и "
        "рекомендованный следующий шаг обучения."
    )
    body = json.dumps(
        {
            "model": model,
            "stream": False,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": json.dumps(context, ensure_ascii=False)},
            ],
            "options": {"temperature": 0.3},
        },
        ensure_ascii=False,
    ).encode("utf-8")
    try:
        request = Request(
            f"{base_url}/api/chat", data=body, method="POST", headers={"Content-Type": "application/json"}
        )
        with urlopen(request, timeout=25) as response:
            data = json.loads(response.read().decode("utf-8"))
        text = str(data.get("message", {}).get("content", "")).strip()
        return text or None
    except (OSError, URLError, ValueError, TimeoutError):
        return None

_DECISION_TEXT = {
    "RETRAIN": "рекомендовано повторное прохождение сценария",
    "REINFORCEMENT": "рекомендовано точечное закрепление отдельных тем",
    "PASS": "сессия зачтена без дополнительных требований",
}

_TREND_TEXT = {
    "improving": "по прошлым сессиям динамика оператора положительная",
    "declining": "по прошлым сессиям динамика оператора отрицательная — стоит обратить на это внимание",
    "stable": "по прошлым сессиям динамика оператора стабильная",
}

def _template_debrief(context: dict[str, Any]) -> str:
    """Fallback без LLM: собирает связный текст из тех же полей по шаблону."""
    parts: list[str] = []

    operator = context.get("operatorName") or "Оператор"
    overall = str(context.get("overallLevel") or "").strip()
    score = context.get("scorePercent")
    score_part = f", итоговая оценка {score}%" if score is not None else ""
    parts.append(
        f"{operator}, результат сессии: {overall.lower() if overall else 'обработан'}{score_part}."
    )

    strengths = context.get("strengths") or []
    if strengths:
        parts.append("Сильные стороны: " + "; ".join(str(s) for s in strengths) + ".")

    findings = context.get("findings") or []
    if findings:
        titles = []
        for item in findings:
            title = str(item.get("title") or "").strip()
            evidence = str(item.get("evidence") or "").strip()
            titles.append(f"{title} ({evidence})" if evidence else title)
        parts.append("Основные замечания: " + "; ".join(t for t in titles if t) + ".")
    else:
        parts.append("Существенных замечаний по действиям не выявлено.")

    decision = (context.get("instructorDecision") or {}).get("decision")
    reasons = (context.get("instructorDecision") or {}).get("reasons") or []
    decision_text = _DECISION_TEXT.get(decision, "решение сформировано по итогам анализа")
    decision_sentence = f"Решение инструктора: {decision_text}."
    if reasons:
        decision_sentence += " " + " ".join(str(r) for r in reasons)
    parts.append(decision_sentence)

    training_title = (context.get("adaptiveTraining") or {}).get("trainingTitle")
    if training_title:
        parts.append(f"Рекомендуемый следующий шаг: тренинг «{training_title}».")

    trend_text = _TREND_TEXT.get(context.get("operatorTrend"))
    if trend_text:
        parts.append(trend_text.capitalize() + ".")

    return " ".join(parts)

def build_debrief(analysis: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    """
    Возвращает {"narrative": текст, "mode": источник}. Источник — либо
    локальная LLM (local-ollama-debrief), либо детерминированный шаблон
    (local-template-debrief), если LLM недоступна/выключена/дала пустой
    ответ.
    """
    context = _debrief_context(analysis, payload)
    narrative = _ollama_debrief(context)
    if narrative:
        return {"narrative": narrative, "mode": "local-ollama-debrief"}
    return {"narrative": _template_debrief(context), "mode": "local-template-debrief"}


def _normalize_finding(item: dict[str, Any]) -> dict[str, Any]:
    """Приводит ML/event finding к схеме UI (evidence, articleId)."""
    training_id = item.get("trainingId")
    article_id = item.get("articleId") or (
        TRAINING_ARTICLE_MAP.get(str(training_id)) if training_id else None
    )
    evidence = item.get("evidence")
    if not evidence:
        parts = [
            str(item.get("operatorAction") or "").strip(),
            str(item.get("explanation") or "").strip(),
        ]
        location = item.get("location") or {}
        zone = location.get("zone")
        if zone:
            parts.append(f"Зона: {zone}")
        evidence = " ".join(part for part in parts if part) or str(
            item.get("recommendation") or ""
        )
    return {
        "code": item.get("code") or "FINDING",
        "severity": item.get("severity") or "info",
        "title": item.get("title") or "Находка",
        "evidence": evidence,
        "recommendation": item.get("recommendation") or "",
        "trainingId": training_id,
        "articleId": article_id,
        "classification": item.get("classification"),
        "location": item.get("location"),
        "timeline": item.get("timeline"),
        "operatorAction": item.get("operatorAction"),
        "expectedAction": item.get("expectedAction"),
        "explanation": item.get("explanation"),
    }


def _normalize_trajectory_item(item: dict[str, Any]) -> dict[str, Any]:
    location = item.get("location") or {}
    zone = location.get("zone") or "Операторское управление"
    action = item.get("action") or ""
    return {
        "sequence": item.get("sequence"),
        "at": item.get("at"),
        "category": item.get("category") or zone,
        "description": item.get("description") or "",
        "interpretation": item.get("interpretation")
        or (f"Команда: {action}" if action else zone),
        "action": action,
        "location": location,
    }


def _analyze_session_ml(payload: dict[str, Any]) -> dict[str, Any]:
    process = payload.get("process") or {}
    actions = payload.get("actionsLog") or []
    events = payload.get("systemEvents") or []

    score = int(payload.get("scorePercent", 0) or 0)
    response_seconds = (
        float(payload["responseSeconds"])
        if payload.get("responseSeconds") is not None
        else None
    )
    scenario_id = str(
        payload.get("scenarioId")
        or process.get("scenarioId")
        or "UNKNOWN"
    )

    trajectory: list[dict[str, Any]] = []
    timestamps: list[int] = []

    for index, item in enumerate(actions, start=1):
        description = str(item.get("description", ""))
        action_name, _ = _action_from_description(description)
        zone, equipment = _equipment_from_action(action_name)
        timestamp = int(item.get("at", 0) or 0)

        if timestamp:
            timestamps.append(timestamp)

        trajectory.append(
            {
                "sequence": index,
                "at": timestamp,
                "description": description,
                "action": action_name,
                "location": {
                    "zone": zone,
                    "equipment": equipment,
                },
            }
        )

    localized_errors, ml_predictions = localize_operator_errors_ml(
        process=process,
        actions=actions,
        scenario_id=scenario_id,
        response_seconds=response_seconds,
    )

    system_event_findings = _analyze_system_events(events)
    all_findings = localized_errors + system_event_findings

    adaptive_result = build_adaptive_plan(
        localized_errors=localized_errors,
        scenario_id=scenario_id,
        score_percent=score,
    )

    gaps = [
        max(0.0, (right - left) / 1000)
        for left, right in zip(timestamps, timestamps[1:])
    ]
    duration_seconds = (
        max(0.0, (timestamps[-1] - timestamps[0]) / 1000)
        if len(timestamps) > 1
        else 0.0
    )
    max_pause_seconds = max(gaps, default=0.0)

    critical_count = sum(item.get("severity") == "critical" for item in all_findings)
    warning_count = sum(item.get("severity") == "warning" for item in all_findings)
    normal_count = sum(
        item.get("label") == "NORMAL"
        for item in ml_predictions
    )

    if adaptive_result["retrainingDecision"]["level"] == "mandatory" or critical_count:
        overall_level = "Требуется повторная отработка"
    elif adaptive_result["retrainingDecision"]["level"] == "targeted" or warning_count:
        overall_level = "Нужно точечное закрепление"
    elif adaptive_result["retrainingDecision"]["level"] == "recommended":
        overall_level = "Результат устойчивый, рекомендуется закрепление"
    else:
        overall_level = "Высокая готовность"

    training_article_map = {
        "MT-FEED-01": "feed-system",
        "MT-FEED-02": "feed-pumps",
        "MT-ELOU-01": "elou-principle",
        "MT-ELOU-02": "elou-quality",
        "MT-E1-01": "e1-water",
        "MT-K1-01": "k1-control",
        "MT-K1-02": "k1-low-level",
        "MT-FURN-01": "furnace-safety",
        "MT-K2-01": "k2-control",
        "MT-K2-02": "k2-low-level",
        "MT-UTIL-01": "instrument-air",
        "MT-VENT-01": "ventilation",
        "MT-SAFE-01": "cooling-loss",
    }

    recommendations: list[dict[str, Any]] = []
    used_training_ids: set[str] = set()

    for step in adaptive_result["adaptivePlan"]:
        training_id = str(step["trainingId"])
        article_id = training_article_map.get(training_id)

        if training_id in used_training_ids or not article_id:
            continue

        recommendations.append(
            _recommendation(
                training_id,
                article_id,
                str(step["reason"]),
            )
        )
        used_training_ids.add(training_id)

    for finding in system_event_findings:
        training_id = finding.get("trainingId")
        article_id = finding.get("articleId")
        if training_id and article_id and training_id not in used_training_ids:
            recommendations.append(
                _recommendation(str(training_id), str(article_id), str(finding.get("recommendation", "")))
            )
            used_training_ids.add(str(training_id))

    strengths: list[str] = []

    if normal_count:
        strengths.append(
            f"ML-модель классифицировала корректными действий: {normal_count}."
        )

    if not localized_errors:
        strengths.append(
            "ML-модель не выявила ошибок оператора в проанализированных действиях."
        )

    if response_seconds is not None:
        strengths.append(
            f"Время защитной реакции в сессии: {response_seconds:.1f} с."
        )

    control_areas = sorted(
        {
            prediction["location"]["zone"]
            for prediction in ml_predictions
            if prediction.get("location", {}).get("zone")
        }
    )

    average_confidence = (
        round(
            sum(float(item.get("confidence", 0)) for item in ml_predictions)
            / len(ml_predictions),
            4,
        )
        if ml_predictions
        else 0.0
    )

    metrics = {
        "scorePercent": score,
        "actionsCount": len(actions),
        "eventsCount": len(events),
        "criticalCount": critical_count,
        "warningCount": warning_count,
        "normalActionsCount": normal_count,
        "mlAverageConfidence": average_confidence,
        "durationSeconds": round(duration_seconds, 1),
        "maxPauseSeconds": round(max_pause_seconds, 1),
        "controlAreasCount": len(control_areas),
    }

    partial_analysis = {"findings": all_findings, "localizedErrors": localized_errors, "metrics": metrics}
    operator_profile = _build_operator_profile(payload, partial_analysis)
    operator_behavior = _build_operator_behavior(actions, response_seconds)
    adaptive_training = _build_adaptive_training(
        findings=all_findings,
        localized_errors=localized_errors,
        recommendations=recommendations,
        operator_profile=operator_profile,
    )
    instructor_decision = _build_instructor_decision(
        metrics=metrics,
        operator_profile=operator_profile,
        adaptive_training=adaptive_training,
        findings=all_findings,
        localized_errors=localized_errors,
        operator_behavior=operator_behavior,
    )

    summary = (
        f"ML-анализ завершён: обработано действий — {len(actions)}; "
        f"критических отклонений — {critical_count}; "
        f"предупреждений — {warning_count}; "
        f"итоговый балл сценария — {score}%; "
        f"решение инструктора — {instructor_decision['decision']}."
    )

    result = {
        "analysisId": f"analysis-{uuid.uuid4().hex[:12]}",
        "generatedAt": int(time.time() * 1000),
        "mode": "local-ml-classification",
        "model": {
            "actionClassifier": "action_error_classifier.joblib",
            "riskPredictor": "risk_predictor.joblib",
        },
        "scenarioId": scenario_id,
        "overallLevel": overall_level,
        "summary": summary,
        "metrics": metrics,
        "trajectory": trajectory[-30:],
        "mlPredictions": ml_predictions[-30:],
        "localizedErrors": localized_errors,
        "systemEventFindings": system_event_findings,
        "findings": all_findings,
        "controlAreas": control_areas,
        "strengths": strengths[:5],
        "recommendations": recommendations[:4],
        "retrainingRequired": adaptive_result["retrainingRequired"],
        "retrainingDecision": adaptive_result["retrainingDecision"],
        "adaptivePlan": adaptive_result["adaptivePlan"],
        "controlScenario": adaptive_result["controlScenario"],
        "operatorProfile": operator_profile,
        "operatorBehavior": operator_behavior,
        "adaptiveTraining": adaptive_training,
        "instructorDecision": instructor_decision,
        "disclaimer": (
            "Результат сформирован локальными ML-моделями на синтетических "
            "учебных данных и относится только к учебной модели КТК."
        ),
    }

    result["findings"] = [_normalize_finding(item) for item in result.get("findings") or []]
    result["localizedErrors"] = [
        _normalize_finding(item) for item in result.get("localizedErrors") or []
    ]
    result["systemEventFindings"] = [
        _normalize_finding(item) for item in result.get("systemEventFindings") or []
    ]
    result["trajectory"] = [
        _normalize_trajectory_item(item) for item in result.get("trajectory") or []
    ]
    metrics = result.setdefault("metrics", {})
    actions_log = payload.get("actionsLog") or []
    metrics.setdefault(
        "duplicateActions",
        sum(
            1
            for index in range(1, len(actions_log))
            if str(actions_log[index].get("description", ""))
            == str(actions_log[index - 1].get("description", ""))
        ),
    )
    result["debrief"] = build_debrief(result, payload)

    return result


def analyze_session(payload: dict[str, Any]) -> dict[str, Any]:
    """ML-анализ при доступных моделях, иначе rules-fallback."""
    from backend.ai.rules_analysis import analyze_session_rules

    if ml_available():
        try:
            return _analyze_session_ml(payload)
        except Exception as exc:  # noqa: BLE001
            fallback = analyze_session_rules(payload)
            fallback["mode"] = "local-explainable-analysis"
            fallback["mlFallbackReason"] = str(exc)
            return fallback
    fallback = analyze_session_rules(payload)
    fallback["mlFallbackReason"] = _ml_unavailable_reason or "ML-модели недоступны"
    return fallback


def _ollama_answer(message: str, articles: list[dict[str, Any]], context: dict[str, Any]) -> str | None:
    provider = os.getenv("KTK_AI_PROVIDER", "rules").casefold()
    if provider not in {"ollama", "auto"}:
        return None
    model = os.getenv("KTK_OLLAMA_MODEL", "qwen3:4b-instruct")
    base_url = os.getenv("KTK_OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/")
    sources = "\n\n".join(
        f"[{article['id']}] {article['title']}\n{article['summary']}\n"
        + "\n".join(flatten_article(article) or article.get("content", []))
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
        paragraphs = (flatten_article(lead) or lead.get("content", []))[:2]
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
            training = TRAINING_BY_ID.get(training_id)
            if not training:
                continue
            related.append(
                {
                    "trainingId": training_id,
                    "trainingTitle": training["title"],
                    "segment": training.get("segment", ""),
                }
            )
            used_training.add(training_id)
    return {
        "messageId": f"msg-{uuid.uuid4().hex[:12]}",
        "answer": answer,
        "mode": mode,
        "sources": [
            {"articleId": article["id"], "title": article["title"], "category": article.get("category", "")}
            for article in articles[:3]
        ],
        "relatedTrainings": related[:3],
    }

def _candidate_description(candidate: dict[str, Any]) -> str:
    description = str(candidate.get("description", "")).strip()
    if description:
        return description

    command = str(candidate.get("command", "")).strip()
    action = str(candidate.get("action", "")).strip()
    equipment_id = str(candidate.get("id", candidate.get("equipmentId", ""))).strip()
    value = candidate.get("value")

    parts = [part for part in (command, equipment_id, action) if part]
    if value is not None:
        parts.append(str(value))
    return ": ".join(parts) or "Планируемое действие"

_UTILITY_KEYS = {
    "COOLINGWATEROK": "coolingWaterOk",
    "VENTELOUOK": "ventElouOk",
    "STEAMOK": "steamOk",
    "POWEROK": "powerOk",
    "VENTOPSOK": "ventOpsOk",
    "INSTRUMENTAIROK": "instrumentAirOk",
}

_TOGGLE_KEYS = {
    "ELECTRICFIELDON": "toggle-electric-field",
    "DEMULSIFIERON": "toggle-demulsifier",
    "WASHWATERON": "toggle-wash-water",
    "AVOFANON": "set-avo-fan",
}

def _candidate_to_ml_action(candidate: dict[str, Any]) -> tuple[str, float]:
    """
    Нормализует планируемую команду в формат dataset_risk.csv.
    Это адаптация формата API, а не правило выявления ошибки.
    """
    command = str(candidate.get("command", "")).casefold()
    action = str(candidate.get("action", "")).casefold()
    equipment_id = str(candidate.get("id", candidate.get("equipmentId", ""))).upper()
    description = str(candidate.get("description", "")).casefold()
    value = candidate.get("value")

    if command == "fuel" or "топлив" in description:
        return "set-fuel", _to_float(value)

    if command == "pump":
        pump_id = equipment_id.replace("Н", "N")
        if pump_id in {"N-1", "N-2", "N-3"}:
            if action == "start":
                return f"start-{pump_id}", 0.0
            if action == "stop":
                return f"stop-{pump_id}", 0.0

    if command == "valve":
        valve_id = equipment_id.replace("Л", "L")
        if valve_id in {"L-1", "L-2", "L-3"}:
            if action == "open":
                return f"open-{valve_id}", 100.0
            if action == "close":
                return f"close-{valve_id}", 0.0

    if command == "utility":
        field = _UTILITY_KEYS.get(equipment_id)
        if field == "coolingWaterOk":
            return ("restore-cooling", 1.0) if bool(value) else ("disable-cooling", 0.0)
        if field == "ventElouOk":
            return ("restore-ventilation", 1.0) if bool(value) else ("disable-ventilation", 0.0)
        if field in {"steamOk", "powerOk", "ventOpsOk", "instrumentAirOk"}:
            return f"set-{field}", 1.0 if bool(value) else 0.0

    if command == "toggle":
        mapped = _TOGGLE_KEYS.get(equipment_id)
        if mapped:
            return mapped, 1.0 if bool(value) else 0.0

    if command in {"level-setpoint", "levelsetpoint"}:
        column = str(candidate.get("column", "")).upper()
        if column == "K-1":
            return "set-level-setpoint-K1", _to_float(value)
        if column == "K-2":
            return "set-level-setpoint-K2", _to_float(value)

    if command == "drain":
        return "drain-vessel", 0.0

    if command == "protect-level":
        column = str(candidate.get("column", "")).upper()
        if column == "K-1":
            return "protect-K1", 0.0
        if column == "K-2":
            return "protect-K2", 0.0

    raw_action = str(candidate.get("candidateAction", "")).strip()
    if raw_action:
        return raw_action, _to_float(value)

    return "unknown-action", _to_float(value)

def _last_ml_action_name(actions: list[dict[str, Any]]) -> str:
    if not actions:
        return "NONE"

    last_description = str(actions[-1].get("description", ""))
    action_name, _ = _action_from_description(last_description)
    return action_name

def _risk_features(
    *,
    process: dict[str, Any],
    actions: list[dict[str, Any]],
    candidate: dict[str, Any],
    scenario_id: str,
    now_ms: int | None = None,
) -> tuple[dict[str, Any], str]:
    candidate_action, action_value = _candidate_to_ml_action(candidate)

    last_at = int(actions[-1].get("at", 0) or 0) if actions else 0
    current_ms = now_ms if now_ms is not None else int(time.time() * 1000)
    pause_seconds = max(0.0, (current_ms - last_at) / 1000) if last_at else 0.0
    pause_seconds = min(pause_seconds, 3600.0)

    last_description = str(actions[-1].get("description", "")) if actions else ""
    candidate_description = _candidate_description(candidate)
    duplicate_count = int(
        bool(last_description and candidate_description == last_description)
    )

    features = {
        "scenarioId": scenario_id or "UNKNOWN",
        "candidateAction": candidate_action,
        "previousAction": _last_ml_action_name(actions),
        "expectedAction": str(
            candidate.get("expectedAction")
            or process.get("expectedAction")
            or candidate_action
            or "check-process-state"
        ),
        "sequencePosition": len(actions) + 1,
        "responseSeconds": _to_float(candidate.get("responseSeconds"), pause_seconds),
        "pauseSeconds": pause_seconds,
        "duplicateCount": duplicate_count,
        "actionValue": action_value,
        "valveL1": _to_float(process.get("valveL1")),
        "feedFlow": _to_float(process.get("feedFlow")),
        "pressureK1": _to_float(process.get("pressureK1")),
        "pressureK2": _to_float(process.get("pressureK2")),
        "levelK1": _to_float(process.get("levelK1"), 50.0),
        "levelK2": _to_float(process.get("levelK2"), 50.0),
        "temperatureFurnace": _to_float(process.get("tempFurnaceOut")),
        "gasPercent": _to_float(process.get("gasPercent")),
        "saltMgL": _to_float(process.get("saltMgL")),
        "waterAfterElou": _to_float(process.get("waterAfterElou")),
        "powerOk": bool(process.get("powerOk", True)),
        "instrumentAirOk": bool(process.get("instrumentAirOk", True)),
        "coolingWaterOk": bool(process.get("coolingWaterOk", True)),
        "ventElouOk": bool(process.get("ventElouOk", True)),
    }
    return features, candidate_action

def _predict_risk_ml(payload: dict[str, Any]) -> dict[str, Any]:
    """
    ML-прогноз вероятности ошибки ДО выполнения операторской команды.
    Модель risk_predictor.joblib обучена на dataset_risk.csv.
    """
    process = payload.get("process") or {}
    actions = payload.get("actionsLog") or []
    candidate = (
        payload.get("candidateAction")
        or payload.get("candidate")
        or payload.get("action")
        or {}
    )
    if isinstance(candidate, str):
        candidate = {"type": candidate}

    scenario_id = str(
        payload.get("scenarioId")
        or process.get("scenarioId")
        or "UNKNOWN"
    )

    client_now = candidate.get("clientNowMs") or payload.get("clientNowMs")
    now_ms = int(client_now) if client_now is not None else None

    features, candidate_action = _risk_features(
        process=process,
        actions=actions,
        candidate=candidate,
        scenario_id=scenario_id,
        now_ms=now_ms,
    )

    bundle = _load_risk_model()
    pipeline = bundle["pipeline"]
    columns = bundle["features"]

    frame = _frame_from_features(features, columns)

    probabilities = pipeline.predict_proba(frame)[0]
    classes = list(pipeline.named_steps["model"].classes_)
    positive_class = bundle.get("positiveClass", 1)
    if positive_class not in classes:
        error_probability = 0.0
    else:
        positive_index = classes.index(positive_class)
        error_probability = float(probabilities[positive_index])

    risk_score = round(error_probability * 100)
    risk_level = (
        "high" if risk_score >= 70
        else "medium" if risk_score >= 35
        else "low"
    )

    zone, equipment = _equipment_from_action(candidate_action)

    if risk_level == "high":
        prediction = (
            "ML-модель прогнозирует высокую вероятность ошибки "
            "при выполнении выбранной команды в текущем состоянии процесса."
        )
        safe_alternative = (
            "Отмените команду, проверьте готовность оборудования и текущие "
            "параметры, затем выберите безопасное действие."
        )
    elif risk_level == "medium":
        prediction = (
            "ML-модель выявила признаки повышенного риска ошибки "
            "для планируемой команды."
        )
        safe_alternative = (
            "Перед выполнением команды дополнительно проверьте состояние "
            "оборудования, параметры процесса и предыдущие действия."
        )
    else:
        prediction = (
            "ML-модель не выявила существенной вероятности ошибки "
            "для планируемой команды."
        )
        safe_alternative = "Продолжайте контролировать параметры процесса."

    return {
        "mode": "local-ml-risk-prediction",
        "model": "risk_predictor.joblib",
        "scenarioId": scenario_id,
        "candidateAction": {
            "normalized": candidate_action,
            "description": _candidate_description(candidate),
        },
        "riskLevel": risk_level,
        "riskScore": risk_score,
        "errorProbability": round(error_probability, 4),
        "shouldWarn": risk_score >= 35,
        "prediction": prediction,
        "predictedConsequence": (
            "Вероятно выполнение ошибочного или небезопасного действия "
            "в учебной модели."
            if risk_score >= 35
            else "Существенный риск ошибки не прогнозируется."
        ),
        "safeAlternative": safe_alternative,
        "location": {
            "zone": zone,
            "equipment": equipment,
        },
        "evidence": {
            "previousAction": features["previousAction"],
            "sequencePosition": features["sequencePosition"],
            "pauseSeconds": round(features["pauseSeconds"], 2),
            "feedFlow": features["feedFlow"],
            "pressureK1": features["pressureK1"],
            "pressureK2": features["pressureK2"],
            "levelK1": features["levelK1"],
            "levelK2": features["levelK2"],
            "temperatureFurnace": features["temperatureFurnace"],
            "gasPercent": features["gasPercent"],
            "coolingWaterOk": features["coolingWaterOk"],
            "instrumentAirOk": features["instrumentAirOk"],
            "powerOk": features["powerOk"],
        },
    }


def predict_risk(payload: dict[str, Any]) -> dict[str, Any]:
    if not ml_available():
        return {
            "ok": False,
            "available": False,
            "error": _ml_unavailable_reason or "ML-модели риска недоступны",
        }
    try:
        result = _predict_risk_ml(payload)
        result["ok"] = True
        result["available"] = True
        return result
    except Exception as exc:  # noqa: BLE001
        return {
            "ok": False,
            "available": False,
            "error": str(exc),
        }
