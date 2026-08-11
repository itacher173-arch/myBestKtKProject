# AI-модуль

`backend/ai` содержит AI-orchestrator, rule-based анализ, подготовку локальных ML-моделей и manifest локальной LLM. Публичные контракты: `/analyze`, `/risk-preview`, `/chat`.

## Границы

- AI анализирует копию учебного контекста после или во время сессии;
- не отправляет команды симулятору и не изменяет ПАЗ;
- не меняет детерминированную оценку;
- не использует публичный AI API;
- должен корректно работать в `rules`/AI-off режиме;
- возвращает источники, версии модели, индекса и prompt-контракта.

## Состав

| Файл/каталог | Назначение |
| --- | --- |
| `orchestrator.py` | объединение ML, RAG, LLM и fallback |
| `rules_analysis.py` | объяснимый анализ без LLM |
| `engine.py` | совместимые контракты и рекомендации |
| `models/` | joblib-модели, метрики и LLM manifest |
| `training/` | воспроизводимая генерация данных и обучение демонстрационных моделей |
| `training/data/` | синтетические учебные наборы без персональных данных |

Обучение запускается из корня репозитория:

```bash
python -m backend.ai.training.generate_dataset
python -m backend.ai.training.train_models
```

Подробности: [`docs/AI_ARCHITECTURE.md`](../../docs/AI_ARCHITECTURE.md) и [`training/README.md`](training/README.md). Изменение модели требует обновить manifest, checksum, метрики и regression/eval-тесты.
