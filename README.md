# КТК ЭЛОУ-АВТ

Компьютерный тренажёрный комплекс (кейс Ч2026/ГПН): мнемосхема ЭЛОУ-АВТ, сценарии пуска/останова и отказов, журнал и оценка по эталону.

## Структура

```text
frontend/         # КТК (Vite + React + Electron) → :8080
auth-frontend/    # Портал входа → :8082
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
| Вход (auth)  | http://localhost:8082                  | `nginx:1.27-alpine`          |
| КТК (nginx)  | http://localhost:8080                  | `nginx:1.27-alpine`          |
| Админ-панель | http://localhost:8081                  | `nginx:1.27-alpine`          |
| API          | http://localhost:8000/api/health       | `python:3.12-slim` + psycopg |
| Postgres     | внутренняя сеть Docker             | `postgres:16-alpine`         |
| Redis        | внутренняя сеть Docker             | `redis:7-alpine`             |

Postgres — пользователи, группы, отчёты и аудит (порты 5432/6379 наружу не публикуются).
Redis — presence, антибрутфорс логина и серверные сессии.
API users/groups/reports/audit требуют серверную сессию; CRUD пользователей — только admin.
Bootstrap-админ создаётся один раз (пароль при рестарте не сбрасывается).

Вход в КТК — только через портал `:8082`. Прямой доступ к `:8080` без сессии перенаправляет на авторизацию.
Админ-панель: логин `admin` / пароль `admin` на `:8081`.
Вход в КТК — логин (латиница) + пароль; ФИО задаётся при создании пользователя.

Подробнее: `backend/README.md`.

## Возможности

- Мнемосхема ЭЛОУ-АВТ, роли обучаемый / инструктор
- Сценарии: пуск, плановый останов, SC-01…SC-15 / MVP
- Управление: насосы, задвижки, ЭЛОУ, печи, АВО, утилиты
- Журнал, таймер, пауза; чек-лист шагов сценария
- Режимы обучение / экзамен; оценка по исходу процесса
- Отчёты инструктора, протокол JSON и журнал аудита
