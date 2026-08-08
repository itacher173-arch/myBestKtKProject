# КТК ЭЛОУ-АВТ

Компьютерный тренажёрный комплекс (кейс Ч2026/ГПН): мнемосхема ЭЛОУ-АВТ, сценарии пуска/останова и отказов, журнал и оценка по эталону.

## Структура

```text
frontend/         # КТК (Vite + React + Electron) → :8080
admin-frontend/   # Админ-панель → :8081
backend/          # Python API (gateway, storage, knowledge, training, presence)
docs/
docker-compose.yml
```

## Запуск

### Локально (без Docker)

```bash
npm install --prefix frontend
npm install --prefix admin-frontend
npm run backend   # API :8000
npm run dev       # КТК :5173
npm run dev:admin # админка :5174
```

### Docker Compose

```bash
npm run docker:up
# собирает frontend + admin-frontend и поднимает контейнеры
```

| Сервис       | URL                                    | Образ                        |
| ------------ | -------------------------------------- | ---------------------------- |
| КТК (nginx)  | http://localhost:8080                  | `nginx:1.27-alpine`          |
| Админ-панель | http://localhost:8081                  | `nginx:1.27-alpine`          |
| API          | http://localhost:8000/api/health       | `python:3.12-slim` + psycopg |
| Postgres     | `localhost:5432` (user/pass/db: `ktk`) | `postgres:16-alpine`         |

Postgres используется storage-сервисом: отчёты, аудит, пользователи и группы.
localStorage — только кэш UI.

Админ-панель: логин `admin` / пароль `admin`.
Учётные записи обучаемых и инструкторов создаются только в админке.
Инструктор в КТК видит только свои группы.

Подробнее: `backend/README.md`.

## Возможности

- Мнемосхема ЭЛОУ-АВТ, роли обучаемый / инструктор
- Сценарии: пуск, плановый останов, SC-01…SC-15 / MVP
- Управление: насосы, задвижки, ЭЛОУ, печи, АВО, утилиты
- Журнал, таймер, пауза; чек-лист шагов сценария
- Режимы обучение / экзамен; оценка по исходу процесса
- Отчёты инструктора, протокол JSON и журнал аудита
