# Решение типовых проблем

## `gh` не распознаётся после установки

Закройте PowerShell и откройте новое окно. Проверка:

```powershell
gh --version
```

Если PATH ещё не обновлён:

```powershell
& "C:\Program Files\GitHub CLI\gh.exe" auth status
```

## PowerShell запрещает `npm.ps1`

Используйте исполняемый shim:

```powershell
npm.cmd ci --prefix frontend\trainer
npm.cmd run build --prefix frontend\trainer
```

Изменение системной execution policy для сборки проекта не требуется.

## Docker Desktop сообщает о WSL 2

Откройте PowerShell от администратора:

```powershell
wsl --status
wsl --update
```

После обновления перезагрузите Windows и проверьте Docker:

```powershell
docker version
docker compose version
```

Если корпоративная политика запрещает WSL/виртуализацию, согласуйте разрешённый runtime с администраторами: текущий `main` ориентирован на Docker Compose.

## Compose не принимает конфигурацию

```bash
docker compose config
```

Чаще всего не заданы обязательные `POSTGRES_PASSWORD`, `KTK_ADMIN_LOGIN`, `KTK_ADMIN_PASSWORD` или `KTK_AUDIT_HMAC_SECRET`. Скопируйте `.env.example` в `.env` и заполните значения.

## Порт занят

PowerShell:

```powershell
Get-NetTCPConnection -LocalPort 8080,8000 -ErrorAction SilentlyContinue
```

Остановите конфликтующий процесс либо измените публикацию порта в локальном override-файле Compose. Не меняйте базовый `docker-compose.yml` только для особенностей одного ПК.

## Контейнеры не становятся healthy

```bash
docker compose ps
docker compose logs --tail=150 postgres redis auth-api system-api
```

Проверяйте зависимости снизу вверх: PostgreSQL/Redis, auth, system-api, AI-контур, web.

## Долго загружается LLM

```bash
docker compose ps -a llm-model llm-server
docker compose logs llm-model llm-server
```

Загрузка выполняется один раз в volume и проверяется по SHA-256. Чтобы ответы формировались без использования генеративной модели, задайте в `.env`:

```dotenv
KTK_AI_PROVIDER=rules
```

В текущем Compose это не исключает контейнеры LLM из графа запуска и не отменяет первичную загрузку модели.

## `401 Unauthorized` в тесте живого gateway

Убедитесь, что тест обращается к версии backend из текущей ветки и использует действующую сессию. Остановите старый локальный процесс на `8000`, перезапустите стек и повторите. Unit-тесты не должны зависеть от случайно запущенного внешнего gateway.

## После обновления пропали данные

Проверьте, что запуск выполнен с тем же `COMPOSE_PROJECT_NAME`: имя проекта определяет имена volumes. Не выполняйте `docker compose down --volumes`, если данные нужны. Используйте backup и restore из [OPERATIONS.md](OPERATIONS.md).

## Git отклоняет push в `main`

```powershell
git fetch origin
git rebase origin/main
git push origin main
```

Не используйте `--force` для общей ветки. При включённой защите `main` отправьте изменения в отдельную ветку и создайте pull request.
