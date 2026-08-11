# КТК ЭЛОУ-АВТ

Компьютерный тренажёрный комплекс: мнемосхема ЭЛОУ-АВТ, сценарии пуска/останова и отказов, мини-уроки, журнал и оценка.

База знаний хранится в `backend/knowledge`: версионируемые русскоязычные пакеты находятся в `content/ru`, обезличенные схемы — в `assets`, локальный фонд открытых документов — в `references`, а правила подготовки материалов — в `CONTENT_GUIDE.md`. Статьи не требуют перехода на внешние сайты: документы открываются через внутренний API. Frontend и ИИ-модуль используют единый серверный каталог.

## Что поднимается

`npm run docker:up` (или `docker compose up --build -d`) собирает UI **внутри** образа `web` и поднимает стек:

- **web** — nginx: вход `/`, КТК `/app/`, админка `/admin/` (фронты собираются в Docker)
- **auth-api**, **system-api**, **ai-api** (AI orchestrator)
- **rag-api**, **ml-recommender**, **qdrant**
- **postgres**, **redis**
- **llm-server**: **llama.cpp** + Qwen2.5 1.5B GGUF из GitHub Release

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

Обычный запуск поднимает полный AI-контур с локальной LLM без Ollama:

```bash
docker compose --env-file .env.test up --build -d
```

При первом запуске `llm-model` скачает GGUF-артефакт из GitHub Release в
именованный Docker volume и проверит SHA-256, после чего `llm-server` запустит
его через `llama.cpp`. В репозитории хранятся только manifest и checksum,
поэтому бинарные веса не раздувают git-историю.

Готово, когда контейнеры healthy. Открыть:

| Что        | URL                              |
| ---------- | -------------------------------- |
| Вход       | http://localhost:8080/           |
| Тренажёр   | http://localhost:8080/app/       |
| Админка    | http://localhost:8080/admin/     |
| API health | http://localhost:8000/api/health |

Вход в админку — логин/пароль из `export` выше (создаётся при первом старте, если админов ещё нет).

## AI-контур

- `ai-api` — единая точка `/analyze`, `/chat`, `/risk-preview`, объединяет результаты.
- `ml-recommender` — классификация ошибок, профиль навыков и ranking следующего модуля.
- `rag-api` — версионируемый поиск по `backend/knowledge`; при недоступном
  Qdrant остаётся lexical fallback.
- `qdrant` — индекс фрагментов базы знаний и метаданных источников.
- `llm-server` (`llama.cpp`) — генеративное объяснение и ответы RAG; не принимает решение о
  зачёте или обязательном переобучении.

Подробные границы, fallback и версия модели описаны в
[`docs/AI_ARCHITECTURE.md`](docs/AI_ARCHITECTURE.md).

Проверить состояние:

```bash
docker compose ps
curl -s http://localhost:8000/api/health | python3 -m json.tool
docker compose logs ai-api rag-api ml-recommender
```

### Остановка и логи

```bash
npm run docker:logs   # следить за логами
npm run docker:down   # остановить стек
```

Только пересобрать UI-образ: `npm run build:web`.
