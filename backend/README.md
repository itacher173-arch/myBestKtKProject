# Backend КТК ЭЛОУ-АВТ

Backend реализован на Python 3.12. Модули разделены по предметной ответственности, но в текущем Docker Compose часть из них запускается совместно в контейнере `system-api`.

## Модули

| Каталог | Ответственность | Runtime |
| --- | --- | --- |
| `api` | FastAPI health, сценарии, сессии, команды и WebSocket | `system-api:8010` |
| `gateway` | единая точка `/api/*`, маршрутизация и health aggregation | `system-api:8000` |
| `auth` | вход, пользователи, роли и Redis-сессии | `auth-api:8102` |
| `simulator` | модель процесса, ПАЗ, отказы, команды и тик | внутри `system-api` |
| `scenarios` | схема и валидация сценариев | через FastAPI |
| `training` | каталог, запуск и проверка мини-тренировок | `system-api:8103` |
| `knowledge` | статьи, поиск, схемы и локальные документы | `system-api:8104` |
| `storage` | отчёты, аудит, группы и доступ | `system-api:8105` |
| `presence` | WebSocket presence | `system-api:8106` |
| `ai` | анализ, чат и orchestration | `ai-api:8107` |
| `rag` | индексирование и retrieval | `rag-api:8108` |
| `ml` | классификация и рекомендации | `ml-recommender:8109` |
| `common` | HTTP, PostgreSQL, Redis и метрики | библиотека |

Внешний клиент работает через gateway. Внутренние порты не являются публичным API.

## Данные

- PostgreSQL: пользователи, роли, группы, отчёты и аудит;
- Redis: серверные сессии, rate limiting и presence;
- Qdrant: воспроизводимый индекс фрагментов базы знаний;
- JSON: статьи, тренировки, граф навыков и схемы;
- GGUF/joblib: локальные версионированные AI/ML-артефакты.

## Локальные проверки

```bash
python -m pip install -r backend/requirements.txt pytest ruff
ruff check backend --config backend/ruff.toml
python -m compileall backend
pytest -q backend/tests
```

Проверки не должны требовать доступ к публичному интернету или работающему внешнему AI API.

## Запуск

Полный поддерживаемый запуск выполняется из корня:

```bash
cp .env.example .env
docker compose up --build -d
```

`python -m backend.run_all` предназначен для разработки и требует настроенных PostgreSQL, Redis и переменных окружения. Он совместно запускает auth, gateway, training, knowledge, storage, presence, FastAPI и базовый AI-handler.

## Контракты

Публичные маршруты описаны в [`docs/API.md`](../docs/API.md), архитектурные границы — в [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md). При изменении маршрута, роли, переменной среды или схемы отчёта документация и тесты обновляются в том же PR.

## Безопасность

- bootstrap-учётная запись создаётся только из окружения;
- пароли хранятся как PBKDF2-SHA256 hashes;
- неудачные входы ограничиваются через Redis;
- аудит связан HMAC-цепочкой;
- защищённые операции проверяют роль на сервере;
- AI не получает прямого доступа к симулятору и не определяет зачёт.

Текущие механизмы являются прототипными. Требования до production перечислены в [`SECURITY.md`](../SECURITY.md) и [`docs/INDUSTRIALIZATION.md`](../docs/INDUSTRIALIZATION.md).
