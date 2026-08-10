# КТК ЭЛОУ-АВТ

Компьютерный тренажёрный комплекс: мнемосхема ЭЛОУ-АВТ, сценарии пуска/останова и отказов, мини-уроки, журнал и оценка.

База знаний хранится в `backend/knowledge`: версионируемые русскоязычные пакеты находятся в `content/ru`, обезличенные схемы — в `assets`, а правила подготовки материалов — в `CONTENT_GUIDE.md`. Frontend и ИИ-модуль используют единый серверный каталог.

## Что поднимается

`npm run docker:up` собирает UI на хосте и поднимает весь стек:

- **web** — nginx: вход `/`, КТК `/app/`, админка `/admin/`
- **auth-api**, **system-api**, **ai-api**
- **postgres**, **redis**

## Требования

- Docker и Docker Compose
- Node.js + npm (сборка фронтендов перед образом `web`)

## Запуск всего проекта

Из корня репозитория:

```bash
# 1. Зависимости UI (нужны один раз, и после обновления package.json)
npm install --prefix frontend/auth
npm install --prefix frontend/trainer
npm install --prefix frontend/admin

# 2. Bootstrap-админ (обязательно; не коммитить в git)
export KTK_ADMIN_LOGIN=admin
export KTK_ADMIN_PASSWORD='ваш-секретный-пароль'

# 3. Сборка UI + docker compose up
npm run docker:up
```

Готово, когда контейнеры healthy. Открыть:

| Что        | URL                              |
| ---------- | -------------------------------- |
| Вход       | http://localhost:8080/           |
| Тренажёр   | http://localhost:8080/app/       |
| Админка    | http://localhost:8080/admin/     |
| API health | http://localhost:8000/api/health |

Вход в админку — логин/пароль из шага 2 (создаётся при первом старте, если админов ещё нет).

### Остановка и логи

```bash
npm run docker:logs   # следить за логами
npm run docker:down   # остановить стек
```
