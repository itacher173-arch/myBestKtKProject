# Сторонние компоненты и материалы

Документ является навигационным реестром, а не заменой полного software bill of materials. Точные версии runtime-зависимостей фиксируются в `requirements*.txt`, `package-lock.json`, Dockerfiles и AI manifests.

## Основные программные компоненты

| Компонент | Использование | Источник версии/лицензии |
| --- | --- | --- |
| React, React DOM, Vite, TypeScript | frontend | `frontend/*/package-lock.json` |
| IBM Plex Sans/Mono | локальные шрифты | пакеты `@fontsource`, SIL OFL 1.1 |
| FastAPI, Uvicorn, Pydantic | HTTP/API | `backend/requirements.txt` |
| psycopg, Redis client, websockets | данные и real-time | `backend/requirements.txt` |
| PostgreSQL, Redis, Qdrant, Nginx | контейнерный runtime | `docker-compose.yml`, Dockerfiles |
| llama.cpp | локальный LLM runtime | образ, указанный в `docker-compose.yml` |
| Qwen2.5 0.5B Instruct GGUF | генеративные ответы | `backend/ai/models/llm/manifest.json`, Apache-2.0 |

## Учебные документы

Локальные открытые документы перечислены в [`backend/knowledge/references/catalog.json`](backend/knowledge/references/catalog.json), а их целостность фиксируется в `SHA256SUMS`. Коммерческие ГОСТ, ISO, IEC и защищённые учебники не включаются; их библиография хранится в `standards-register.md`.

Перед релизом необходимо сформировать машинно-читаемый SBOM, проверить лицензии и зафиксировать исключения юридической экспертизой.
