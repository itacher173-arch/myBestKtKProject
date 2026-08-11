# Разработка

## Рабочий процесс

1. синхронизировать `main`;
2. создать короткоживущую ветку `feat/...`, `fix/...`, `docs/...` или `chore/...`;
3. внести изменение вместе с тестами и документацией;
4. выполнить локальные проверки;
5. открыть pull request по шаблону;
6. получить review и подтвердить результаты обязательных локальных проверок;
7. объединить через squash или rebase согласно настройкам репозитория.

Прямой force-push в `main` не допускается.

## Окружение разработчика

Для полного стека используйте Docker Compose. Для локальных проверок нужны:

- Python 3.12;
- Node.js 20 LTS и npm;
- три независимых `package-lock.json` во frontend-модулях.

Backend:

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r backend/requirements.txt pytest ruff
```

PowerShell:

```powershell
py -3.12 -m venv .venv
& .\.venv\Scripts\python.exe -m pip install --upgrade pip
& .\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt pytest ruff
```

При ограниченной PowerShell execution policy запускайте npm как `npm.cmd`.

## Frontend-модули

```bash
npm ci --prefix frontend/trainer
npm ci --prefix frontend/auth
npm ci --prefix frontend/admin
```

Режимы разработки:

```bash
npm run dev --prefix frontend/trainer   # :5173
npm run dev --prefix frontend/admin     # :5174
npm run dev --prefix frontend/auth      # :5175
```

Frontend ожидает gateway на `/api`. Для интеграционной работы проще поднять backend-зависимости через Compose и использовать Nginx-профиль.

Из корня репозитория `npm run build` последовательно собирает все три приложения, а `npm run verify:domain` проверяет сценарии, мини-тренировки, органы управления и полноту мнемосхемы.

## Правила изменения доменных данных

- идентификаторы сценариев, статей, оборудования и мини-тренировок стабильны;
- удаление или переименование требует проверки всех ссылок;
- учебные параметры не выдаются за уставки реальной установки;
- статьи базы знаний проходят правила [`CONTENT_GUIDE.md`](../backend/knowledge/CONTENT_GUIDE.md);
- материалы с ограниченным доступом, реальные P&ID, теги и внутренние регламенты не публикуются;
- изменение оценки не передаётся AI-модулю и сопровождается отдельным тестом.

## Commit messages

Рекомендуемый формат:

```text
<type>(<scope>): <краткий результат>
```

Примеры:

```text
feat(simulator): add deterministic pump trip preset
fix(auth): invalidate session after role change
docs(knowledge): clarify article approval workflow
```

Поддерживаемые типы: `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `build`, `chore`.

## Definition of Done

- поведение и границы изменения понятны из PR;
- новые ветви логики покрыты тестами;
- frontend-сборки и backend-проверки проходят;
- документация и `.env.example` обновлены при изменении интерфейсов;
- нет секретов, персональных данных, производственных уставок и нелицензированных материалов;
- определён rollback для миграций и несовместимых изменений;
- для AI указаны версия модели/промпта, fallback и результаты eval;
- для UI проверены клавиатура, контраст, масштаб и сообщения об ошибках.

Полные команды приведены в [TESTING.md](TESTING.md).
