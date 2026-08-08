# КТК ЭЛОУ-АВТ

Компьютерный тренажёрный комплекс (кейс Ч2026/ГПН): мнемосхема ЭЛОУ-АВТ, сценарии пуска/останова и отказов, журнал и оценка по эталону.

## Структура

```text
frontend/   # Vite + React + Electron
backend/    # Python stdlib API (gateway, storage, knowledge, training)
docs/       # БТ / архитектура / ИБ
docker-compose.yml
```

## Запуск

### Локально (без Docker)

```bash
npm install --prefix frontend
npm run backend   # API :8000
npm run dev       # UI :5173, /api → gateway
```

### Docker Compose

```bash
npm run docker:up
# = npm run build в frontend/ + docker compose up --build -d
```

| Сервис | URL | Образ |
|---|---|---|
| UI (nginx) | http://localhost:8080 | `nginx:1.27-alpine` (~50MB) |
| API | http://localhost:8000/api/health | `python:3.12-slim` + psycopg |
| Postgres | `localhost:5432` (user/pass/db: `ktk`) | `postgres:16-alpine` |

Postgres поднят и используется storage-сервисом: отчёты и аудит в таблицах
`trainee_reports` / `audit_log` (`DATABASE_URL`). localStorage — только кэш UI.

Доступ инструктора: PIN по умолчанию `2026`.

Подробнее: `backend/README.md`.

## Возможности

- Мнемосхема ЭЛОУ-АВТ, роли обучаемый / инструктор
- Сценарии: пуск, плановый останов, SC-01…SC-15 / MVP
- Управление: насосы, задвижки, ЭЛОУ, печи, АВО, утилиты
- Журнал, таймер, пауза; чек-лист шагов сценария
- Режимы обучение / экзамен; оценка по исходу процесса
- Отчёты инструктора, протокол JSON и журнал аудита

## Документы

- `docs/REQUIREMENTS.md` — БТ / ФТТ / НФТ  
- `docs/ARCHITECTURE.md` — архитектура  
- `docs/ECONOMICS.md` — экономика  
- `docs/INFRASTRUCTURE.md` — инфраструктура  
- `docs/SECURITY.md` — ИБ  
