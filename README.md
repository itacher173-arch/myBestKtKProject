# КТК ЭЛОУ-АВТ

Компьютерный тренажёрный комплекс (кейс Ч2026/ГПН): мнемосхема ЭЛОУ-АВТ, сценарии пуска/останова и отказов, журнал и оценка по эталону.

## Структура

```text
frontend/         # КТК (Vite + React), в Docker → /app/
auth-frontend/    # Портал входа, в Docker → /
admin-frontend/   # Админ-панель, в Docker → /admin/
backend/auth/     # авторизация и пользователи
backend/          # gateway, storage, knowledge, training, presence
deploy/docker/    # единый UI-образ (web)
docker-compose.yml
```

## Запуск

### Локально (без Docker)

```bash
npm install --prefix frontend
npm install --prefix admin-frontend
npm install --prefix auth-frontend
npm run backend   # API :8000
npm run dev       # КТК :5173
npm run dev:admin # админка :5174
npm run dev:auth  # вход :5175
```

### Docker Compose

```bash
read -r "KTK_ADMIN_LOGIN?Логин первого администратора: "
read -rs "KTK_ADMIN_PASSWORD?Пароль первого администратора: "; echo
export KTK_ADMIN_LOGIN KTK_ADMIN_PASSWORD
npm run docker:up
# поднимает web + auth-api + system-api + postgres + redis
```

Единый UI собирается внутри образа `web` (multi-stage).  
Учётные данные первого администратора — только через окружение.

| Сервис       | URL                                    | Образ                        |
| ------------ | -------------------------------------- | ---------------------------- |
| UI (web)     | http://localhost:8080/                 | единый nginx (auth+КТК+admin)|
| КТК          | http://localhost:8080/app/             | ↑                            |
| Админ-панель | http://localhost:8080/admin/           | ↑                            |
| API системы  | http://localhost:8000/api/health       | `python:3.12-slim`           |
| Auth API     | внутренняя сеть Docker                 | `python:3.12-slim`           |
| Postgres     | внутренняя сеть Docker                 | `postgres:16-alpine`         |
| Redis        | внутренняя сеть Docker                 | `redis:7-alpine`             |

Вход: http://localhost:8080/ · тренажёр: `/app/` · админка: `/admin/`.

Подробнее: `backend/README.md`.

## Возможности

- Мнемосхема ЭЛОУ-АВТ, роли обучаемый / инструктор
- Сценарии: пуск, плановый останов, SC-01…SC-15 / MVP
- Управление: насосы, задвижки, ЭЛОУ, печи, АВО, утилиты
- Журнал, таймер, пауза; чек-лист шагов сценария
- Режимы обучение / экзамен; оценка по исходу процесса
- Отчёты инструктора, протокол JSON и журнал аудита
