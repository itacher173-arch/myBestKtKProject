# Зависимости и воспроизводимая установка

## Обязательные системные компоненты

| Компонент | Установка на чистом Windows | Назначение |
| --- | --- | --- |
| Python 3.12 x64 | `winget install Python.Python.3.12` | Все backend-службы, SQLite и тесты |
| Node.js LTS x64 | `winget install OpenJS.NodeJS.LTS` | Установка и production-сборка frontend |
| Microsoft App Installer | Штатный компонент Windows 10/11 | Команда `winget` |
| Edge или Chrome | Штатный/корпоративный каталог ПО | Локальный web-клиент |

`INSTALL_ALL_WINDOWS.cmd` выполняет обнаружение, загрузку, установку, сборку и тестирование автоматически.

## Python

Runtime использует стандартную библиотеку Python 3.12: HTTP, JSON, HMAC/PBKDF2, потоки, проксирование и SQLite. Изолированное окружение `.venv` создаётся для воспроизводимости и будущего расширения. Единая точка добавления пакетов — `requirements.txt`.

## Frontend

Прямые зависимости закреплены точными версиями:

- React `18.3.1`;
- React DOM `18.3.1`;
- TypeScript `5.6.2`;
- Vite `5.4.11`;
- Vite React plugin `4.3.4`.

Полное дерево зафиксировано в `apps/frontend/package-lock.json`. Установщик использует `npm.cmd ci --no-audit --no-fund`, поэтому не зависит от PowerShell-политики для `npm.ps1`.

## Опциональный локальный LLM-runtime

Ollama и модель `qwen3:4b-instruct` не обязательны. Без них доступны полный объяснимый анализ, поиск по базе знаний, рекомендации и чат в режиме локального RAG. Опциональный runtime включается только администратором.

## Сеть и автономность

Интернет нужен только при первой установке Python, Node.js и npm-пакетов. После сборки базовый режим полностью локален: внешние API, CDN, телеметрия, web-шрифты и облачные модели не используются.

## Каталоги, создаваемые при эксплуатации

- `.venv` — изолированный Python;
- `apps/frontend/node_modules` — npm-зависимости;
- `apps/frontend/dist` — production frontend;
- `runtime` — PID и журналы запущенных служб;
- `services/knowledge/data` — локальная SQLite-база знаний.
