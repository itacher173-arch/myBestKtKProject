# КТК ЭЛОУ-АВТ

Компьютерный тренажёрный комплекс (кейс Ч2026/ГПН): мнемосхема ЭЛОУ-АВТ, сценарии пуска/останова и отказов, журнал и оценка по эталону.

## Структура

```text
frontend/
  trainer/        # КТК (Vite + React), в Docker → /app/
  auth/           # Портал входа, в Docker → /
  admin/          # Админ-панель, в Docker → /admin/
backend/
  auth/           # авторизация и пользователи
  gateway/        # API-шлюз
  ai/             # ИИ-анализ и чат
  training/       # каталог мини-уроков
  knowledge/      # база знаний
  simulator/      # модель процесса
  storage/        # отчёты, группы, аудит
  presence/       # онлайн-присутствие
deploy/docker/    # единый UI-образ (web)
docker-compose.yml
```

### Модули тренажёра (`frontend/trainer/src/`)

```text
app/           # App.tsx, страницы (StartScreen)
simulator/     # ядро тренажёра + UI-панели (components/)
scheme/        # топология и SVG-мнемосхема (components/)
scenarios/     # каталог и упражнения
training/      # мини-уроки и catalog.json
storage/       # отчёты, аудит, группы (+ pages/ReportsPage)
auth/          # клиент API авторизации
presence/      # онлайн-присутствие
ai/            # ИИ-ассистент и разбор сессии
knowledge/     # база знаний
settings/      # настройки и тема
layout/        # AppShell
common/ui/     # общие компоненты (Icon)
api/           # HTTP-клиент
```

## Запуск

### Локально (без Docker)

```bash
npm install --prefix frontend/trainer
npm install --prefix frontend/admin
npm install --prefix frontend/auth
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
# поднимает web + auth-api + ai-api + system-api + postgres + redis
```

Единый UI собирается на хосте и упаковывается в образ `web`.  
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
