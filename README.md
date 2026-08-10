# КТК ЭЛОУ-АВТ

Компьютерный тренажёрный комплекс (кейс Ч2026/ГПН): мнемосхема ЭЛОУ-АВТ, сценарии пуска/останова и отказов, журнал и оценка по эталону.

## Структура

```text
frontend/         # КТК (Vite + React), в Docker → /app/
auth-frontend/    # Портал входа, в Docker → /
admin-frontend/   # Админ-панель, в Docker → /admin/
backend/auth/     # отдельный сервис авторизации и пользователей
backend/          # рабочий API (gateway, storage, knowledge, training, presence)
deploy/railway/   # единый UI-образ (web) + инструкция Railway
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
read -r "KTK_ADMIN_LOGIN?Логин первого администратора: "
read -rs "KTK_ADMIN_PASSWORD?Пароль первого администратора: "; echo
export KTK_ADMIN_LOGIN KTK_ADMIN_PASSWORD
npm run docker:up
# поднимает web + auth-api + system-api + postgres + redis
```

### Railway (auto-deploy из GitHub)

Нужны **4 сервиса** в одном проекте: `web` + `api` + Postgres + Redis.  
Один connect GitHub поднимает только UI — остальное добавляется через **+ Create**.  
Инструкция: [`deploy/railway/README.md`](deploy/railway/README.md).

Учётные данные первого администратора передаются только через окружение (либо
менеджер секретов) и не хранятся в репозитории. Он создаётся при первом запуске
новой БД; последующие перезапуски его пароль не меняют.

| Сервис       | URL                                    | Образ                        |
| ------------ | -------------------------------------- | ---------------------------- |
| UI (web)     | http://localhost:8080/                 | единый nginx (auth+КТК+admin)|
| КТК          | http://localhost:8080/app/             | ↑                            |
| Админ-панель | http://localhost:8080/admin/           | ↑                            |
| API системы  | http://localhost:8000/api/health       | `python:3.12-slim` + psycopg |
| Auth API     | внутренняя сеть Docker                 | `python:3.12-slim` + psycopg |
| Postgres     | внутренняя сеть Docker                 | `postgres:16-alpine`         |
| Redis        | внутренняя сеть Docker                 | `redis:7-alpine`             |

Postgres — пользователи, группы, отчёты и аудит (порты 5432/6379 наружу не публикуются).
Redis — presence, антибрутфорс логина и серверные сессии.
API users/groups/reports/audit требуют серверную сессию; CRUD пользователей — только admin.
Auth-блок обслуживает `/api/auth/*` и `/api/users/*`; рабочий backend — остальные
маршруты. Gateway на `:8000` сохраняет единый публичный API.
Bootstrap-админ создаётся один раз из переменных `KTK_ADMIN_LOGIN` и
`KTK_ADMIN_PASSWORD` (пароль при рестарте не сбрасывается).

Вход в КТК — через http://localhost:8080/ ; тренажёр — `/app/` (без сессии редирект на вход).
Админ-панель — `/admin/`.
Вход в КТК — логин (латиница) + пароль; ФИО задаётся при создании пользователя.

Подробнее: `backend/README.md`.

## Возможности

- Мнемосхема ЭЛОУ-АВТ, роли обучаемый / инструктор
- Сценарии: пуск, плановый останов, SC-01…SC-15 / MVP
- Управление: насосы, задвижки, ЭЛОУ, печи, АВО, утилиты
- Журнал, таймер, пауза; чек-лист шагов сценария
- Режимы обучение / экзамен; оценка по исходу процесса
- Отчёты инструктора, протокол JSON и журнал аудита
