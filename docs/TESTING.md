# Тестирование

## Матрица проверок

| Уровень | Что проверяет | Команда |
| --- | --- | --- |
| lint | Python-стиль и ошибки импортов | `ruff check backend --config backend/ruff.toml` |
| compile | синтаксис всех Python-модулей | `python -m compileall backend` |
| unit/integration | симулятор, роли, аудит, AI и знания | `pytest -q backend/tests` |
| frontend typecheck | TypeScript-контракты | `npm run build --prefix frontend/<app>` |
| frontend build | production-бандлы трёх приложений | та же команда build |
| docs | существование локальных Markdown-ссылок | `python scripts/check_docs.py` |
| container smoke | запуск и health полного стека | `docker compose up --build -d` |

## Полная локальная проверка

```bash
ruff check backend --config backend/ruff.toml
python -m compileall backend
pytest -q backend/tests
npm ci --prefix frontend/trainer && npm run build --prefix frontend/trainer
npm ci --prefix frontend/auth && npm run build --prefix frontend/auth
npm ci --prefix frontend/admin && npm run build --prefix frontend/admin
python scripts/check_docs.py
docker compose config --quiet
```

## Smoke полного стека

```bash
docker compose up --build -d
docker compose ps
curl --fail http://localhost:8000/api/health
curl --fail http://localhost:8080/
```

После проверки:

```bash
docker compose down
```

## Критические регрессии

Изменения нельзя принимать, если:

- результат сценария перестал быть воспроизводимым при одинаковом `seed`;
- обучаемый получает административные или инструкторские данные;
- AI изменяет оценку или состояние симуляции;
- статья ссылается на отсутствующий локальный источник;
- gateway выдаёт защищённые данные без действующей сессии;
- изменён формат отчёта без обратной совместимости или миграции;
- production-сборка любого frontend-модуля не проходит.

## PREPROD

До промышленного внедрения в PREPROD дополнительно выполняются интеграционные проверки IdP, сетевых политик, очереди, HA, backup/restore, миграций, аудита, SIEM, нагрузки и rollback. Доступ к PREPROD предоставляется разработчикам, назначенным тестировщикам и администраторам соответствующих служб.
