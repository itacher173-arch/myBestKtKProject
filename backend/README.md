# Backend КТК

Python 3.12 · FastAPI · psycopg · Redis · websockets.

Запуск всего проекта — только через Docker из корня репозитория (см. корневой `README.md`):

```bash
npm run docker:up
```

## Контейнеры

| Контейнер   | Что внутри                                      | Порты наружу      |
| ----------- | ----------------------------------------------- | ----------------- |
| `auth-api`  | auth `:8102`                                    | —                 |
| `ai-api`    | ai `:8107`                                      | —                 |
| `system-api`| gateway, training, knowledge, storage, presence, FastAPI | `8000`, `8010`, `8106` |
| `postgres`  | БД отчётов, пользователей, аудита               | —                 |
| `redis`     | сессии, presence                                | —                 |

Внешний API: `http://localhost:8000/api/*` (gateway проксирует в модули).  
Health: `http://localhost:8000/api/health`.

## Модули (порты внутри сети)

| Модуль     | Порт | Назначение                                      |
| ---------- | ---- | ----------------------------------------------- |
| gateway    | 8000 | `/api/*` → auth / ai / training / storage / …   |
| auth       | 8102 | вход, Redis-сессии, CRUD пользователей          |
| training   | 8103 | каталог мини-уроков, evaluate                   |
| knowledge  | 8104 | версионируемые статьи из `backend/knowledge/content/ru` и базовый каталог `backend/knowledge/seed.json` |
| storage    | 8105 | отчёты, аудит, группы → PostgreSQL              |
| presence   | 8106 | WebSocket presence → Redis                      |
| ai         | 8107 | `/analyze`, `/chat` (отключаемый)               |
| fastapi    | 8010 | доп. HTTP API симулятора                        |

## Основные маршруты gateway

```text
/api/auth/*       → auth-api
/api/users/*      → auth-api
/api/ai/*         → ai-api
/api/training/*   → training
/api/reports      → storage
/api/audit        → storage
```

Хранение: PostgreSQL (`trainee_reports`, `audit_log`, …). Старые `backend/runtime/*.json` при старте один раз мигрируют в БД, если таблицы пустые.

Симуляция: `POST /api/sim/sessions` создаёт сессию с `seed`, `modelVersion`, `scenarioVersion`; тик в `system-api`; UI только команды + poll состояния.

## Зависимости образа

`backend/requirements.txt` ставится в `backend/Dockerfile`.  
В образ также копируются модульный каталог базы знаний и `training/catalog.json`.
