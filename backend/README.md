# Backend КТК (стиль AVT_4.0)

Python 3.12 + psycopg + websockets + redis.

## Сервисы

| Сервис | Порт | Назначение |
|---|---|---|
| gateway | 8000 | `/api/*` + раздача `frontend/dist/` |
| training | 8103 | каталог мини-тренингов, evaluate |
| knowledge | 8104 | статьи из `frontend/src/knowledge/seed.json` |
| storage | 8105 | отчёты, аудит, users/groups → PostgreSQL |
| presence | 8106 | WebSocket presence → Redis |

## Запуск

Из корня репозитория:

```bash
python3 -m backend.run_all
# или
npm run backend
```

Нужны `DATABASE_URL` и `REDIS_URL` (в Docker задаются compose).

Проверка: http://127.0.0.1:8000/api/health

UI в dev: `npm run dev` (Vite в `frontend/`, проксирует `/api` на gateway).

## API хранения

```
GET    /api/reports
POST   /api/reports
DELETE /api/reports/:id
DELETE /api/reports

GET    /api/audit
POST   /api/audit
DELETE /api/audit
```

Данные: `backend/runtime/reports.json`, `backend/runtime/audit.json`.

## Docker

```bash
# из корня репозитория
docker compose up --build -d
```

Сервисы: `frontend` (:8080), `backend` (:8000), `postgres` (:5432, user/db `ktk`).

Хранение: PostgreSQL (`trainee_reports`, `audit_log`). Старые `runtime/*.json`
при старте один раз мигрируют в БД, если таблицы пустые.
