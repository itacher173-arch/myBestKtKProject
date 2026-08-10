# КТК ЭЛОУ-АВТ

Компьютерный тренажёрный комплекс: мнемосхема ЭЛОУ-АВТ, сценарии пуска/останова и отказов, мини-уроки, журнал и оценка.

## Что поднимается

`npm run docker:up` (или `docker compose up --build -d`) собирает UI **внутри** образа `web` и поднимает стек:

- **web** — nginx: вход `/`, КТК `/app/`, админка `/admin/` (фронты собираются в Docker)
- **auth-api**, **system-api**, **ai-api**
- **postgres**, **redis**

## Требования

- Docker и Docker Compose  
  Node.js на хосте для запуска через Docker **не нужен**.

## Запуск всего проекта

Из корня репозитория:

```bash
# Bootstrap-админ (обязательно; не коммитить в git)
export KTK_ADMIN_LOGIN=admin
export KTK_ADMIN_PASSWORD='ваш-секретный-пароль'

# Сборка образов (включая фронты) + старт
npm run docker:up
# эквивалент: docker compose up --build -d
```

Готово, когда контейнеры healthy. Открыть:

| Что        | URL                              |
| ---------- | -------------------------------- |
| Вход       | http://localhost:8080/           |
| Тренажёр   | http://localhost:8080/app/       |
| Админка    | http://localhost:8080/admin/     |
| API health | http://localhost:8000/api/health |

Вход в админку — логин/пароль из `export` выше (создаётся при первом старте, если админов ещё нет).

### Остановка и логи

```bash
npm run docker:logs   # следить за логами
npm run docker:down   # остановить стек
```

Только пересобрать UI-образ: `npm run build:web`.
