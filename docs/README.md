# Документация КТК ЭЛОУ-АВТ

Документация разделена по задачам, чтобы README оставался точкой входа, а технические детали имели владельца и понятный жизненный цикл.

| Документ | Для кого | Содержание |
| --- | --- | --- |
| [ARCHITECTURE.md](ARCHITECTURE.md) | архитекторы, разработчики | границы модулей, потоки данных, текущее состояние |
| [API.md](API.md) | frontend и backend-разработчики | публичные маршруты gateway и симулятора |
| [AI_ARCHITECTURE.md](AI_ARCHITECTURE.md) | AI/ML, ИБ, методологи | AI/ML/RAG/LLM, fallback и ограничения |
| [DEPLOYMENT.md](DEPLOYMENT.md) | разработчики, администраторы | локальный Docker-запуск и конфигурация |
| [OPERATIONS.md](OPERATIONS.md) | эксплуатация | health-check, логи, backup, restore, rollback |
| [TESTING.md](TESTING.md) | разработчики, QA | уровни тестов и локальные команды |
| [DEVELOPMENT.md](DEVELOPMENT.md) | участники проекта | окружение, ветки, Definition of Done |
| [INDUSTRIALIZATION.md](INDUSTRIALIZATION.md) | архитекторы, заказчик | разрыв между прототипом и частным облаком |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | все пользователи | типовые проблемы Windows, Docker и портов |
| [GITHUB_SETTINGS.md](GITHUB_SETTINGS.md) | владелец репозитория | branch protection, security и environments |
| [adr/](adr/README.md) | архитекторы, reviewers | журнал принятых архитектурных решений |

Предметные документы находятся рядом с контентом:

- [`backend/knowledge/CONTENT_GUIDE.md`](../backend/knowledge/CONTENT_GUIDE.md) — правила подготовки статей;
- [`backend/knowledge/references/README.md`](../backend/knowledge/references/README.md) — локальный фонд источников;
- [`frontend/ASSETS.md`](../frontend/ASSETS.md) — графика и локальные шрифты.

## Правила актуализации

Изменение кода и документации выполняется в одном pull request, если меняются публичные команды, переменные среды, API, роли, структура данных или эксплуатационные процедуры. Перед review локальные ссылки проверяются командой `python scripts/check_docs.py`.

Документы описывают фактическое состояние `main`. Планируемые возможности маркируются как целевые и не должны подаваться как реализованные.
