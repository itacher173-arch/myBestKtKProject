# Архитектура AI-модуля

## Границы сервисов

```text
UI → gateway/auth → ai-api (orchestrator)
                         ├─ ml-recommender → sklearn models + skill graph
                         ├─ rag-api → Qdrant → versioned knowledge catalog
                         └─ Ollama → ktk-assistant (Qwen 2.5 3B)
```

- `ai-api` сохраняет публичные контракты `/analyze`, `/chat`,
  `/risk-preview`. Он не хранит модели и не индексирует документы.
- `ml-recommender` классифицирует ошибки, прогнозирует риск и ранжирует
  учебные модули. Обязательные решения о зачёте остаются в детерминированных
  правилах приложения.
- `rag-api` режет утверждённые статьи на версионированные фрагменты,
  публикует vectors + metadata в Qdrant и возвращает источники. При отказе
  Qdrant доступен lexical fallback.
- `ollama` генерирует только объяснение и ответ по найденному контексту.
  Она не изменяет отчёт и состояние симулятора.

## Поток анализа сессии

1. Orchestrator отправляет обезличенный payload сессии в `ml-recommender`.
2. ML возвращает структурированные ошибки, confidence, версию модели и
   ranking модулей.
3. Orchestrator формирует поисковый запрос из упражнения, целей и ошибок.
4. `rag-api` возвращает до шести фрагментов с `articleId`, `chunkId`,
   `revision` и `indexVersion`.
5. Если профиль Ollama доступен, LLM пишет debrief строго по JSON и
   источникам. Иначе используется шаблонный debrief.
6. UI получает один совместимый ответ и показывает, какой ML/RAG/LLM режим
   реально сработал.

## Версионирование и воспроизводимость

В ответах сохраняются:

- `modelVersion` — fingerprint sklearn-моделей;
- `skillGraphVersion` — версия графа навыков;
- `indexVersion` и revision статей;
- `promptVersion`;
- source ids для проверки ответа.

Изменение embedding-модели требует `rag-index-ollama --force`, чтобы vectors
одного пространства не смешивались с другим.

## Ollama-модель

`backend/ai/ollama/Modelfile` создаёт локальную модель `ktk-assistant` на
основе `qwen2.5:3b` с доменным system prompt. Это настройка модели, а не
фиктивное «дообучение на документах»: актуальные знания передаются через RAG.

Настоящий LoRA/fine-tune стоит добавлять только после накопления
обезличенного, проверенного преподавателями датасета:

1. зафиксировать train/validation/test;
2. удалить персональные и производственно-чувствительные данные;
3. обучить adapter вне runtime-контейнера;
4. проверить factuality, citations и regressions;
5. собрать отдельный Ollama model artifact и указать новую версию.

## Отказоустойчивость

- нет Qdrant/Ollama → lexical RAG + шаблонный debrief;
- нет ML-сервиса → локальный rules fallback в orchestrator;
- нет sklearn-моделей → rules fallback внутри `ml-recommender`;
- LLM не имеет прямого доступа к БД, Redis, симулятору или файловой системе.

## Эксплуатация

Без LLM:

```bash
docker compose --env-file .env.test up --build -d
```

Полный локальный контур:

```bash
docker compose --env-file .env.test --profile llm up --build -d
docker compose ps -a ollama-init rag-index-ollama
```

После обновления базы знаний:

```bash
docker compose exec rag-api python -m backend.rag.indexer --force
```
