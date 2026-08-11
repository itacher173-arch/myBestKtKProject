# Локальное развёртывание

Поддерживаемый способ запуска текущего `main` — Docker Compose. Нативный запуск отдельных модулей предназначен для разработки и не заменяет полный стек.

## Предварительные требования

| Компонент | Требование |
| --- | --- |
| Git | актуальная поддерживаемая версия |
| Docker | Docker Engine + Compose v2 или Docker Desktop |
| RAM | минимум 8 ГБ, рекомендуется 12–16 ГБ с LLM |
| Диск | ориентировочно 6 ГБ свободного места |
| Порты | `8080` и `8000` свободны |

На Windows 10 Docker Desktop использует WSL 2. Перед установкой проекта убедитесь, что `wsl --status` выполняется без ошибки и Docker запускает тестовый контейнер.

## Конфигурация

Скопируйте шаблон, не изменяя его в Git:

```bash
cp .env.example .env
```

PowerShell:

```powershell
Copy-Item .env.example .env
```

Обязательные значения:

| Переменная | Назначение | Требование |
| --- | --- | --- |
| `POSTGRES_PASSWORD` | пароль БД | уникальный, не демонстрационный |
| `KTK_ADMIN_LOGIN` | bootstrap-администратор | 3–32 символа, латиница, начинается с буквы |
| `KTK_ADMIN_PASSWORD` | пароль администратора | уникальный секрет |
| `KTK_AUDIT_HMAC_SECRET` | подпись цепочки аудита | длинное случайное значение; не менять после появления аудита |

Основные необязательные параметры:

| Переменная | Значение по умолчанию | Назначение |
| --- | --- | --- |
| `KTK_AI_ENABLED` | `true` | включение AI API |
| `KTK_AI_PROVIDER` | `auto` | `auto` для LLM с fallback, `rules` без генерации |
| `KTK_RAG_EMBEDDING_PROVIDER` | `hash` | локальный embedding-провайдер |
| `KTK_KNOWLEDGE_INDEX_VERSION` | `knowledge-v1` | версия индекса |
| `KTK_AI_PROMPT_VERSION` | `ai-prompts-v1` | версия prompt-контракта |
| `KTK_COOKIE_SECURE` | выключено | установить `1` только за HTTPS |
| `KTK_CORS_ORIGINS` | локальные адреса | явный allowlist источников |

Полный перечень и комментарии находятся в [`.env.example`](../.env.example).

## Запуск

```bash
docker compose config --quiet
docker compose up --build -d
docker compose ps
```

Ожидаемые публичные точки:

- `http://localhost:8080/` — вход;
- `http://localhost:8080/app/` — тренажёр;
- `http://localhost:8080/admin/` — администрирование;
- `http://localhost:8000/api/health` — диагностика gateway.

Проверьте готовность:

```bash
docker compose ps
curl --fail http://localhost:8000/api/health
```

В PowerShell без `curl.exe`:

```powershell
Invoke-RestMethod http://localhost:8000/api/health
```

## Режим без генеративных ответов

Чтобы AI-orchestrator не использовал генеративную модель, задайте:

```dotenv
KTK_AI_PROVIDER=rules
```

Контур ML/RAG и шаблонные объяснения сохраняются. Чтобы полностью отключить пользовательские AI-функции, дополнительно задайте `KTK_AI_ENABLED=false`.

Текущий `docker-compose.yml` всё равно создаёт `llm-model` и `llm-server`, потому что AI-профили ещё не разделены. Значение `rules` гарантирует отсутствие генеративных ответов, но не отменяет загрузку образа/модели при полном Compose-запуске. Раздельный Compose profile является задачей индустриализации.

## Обновление

```bash
git pull --ff-only
docker compose build --pull
docker compose up -d
docker compose ps
```

Перед обновлением с изменением схемы данных выполните backup по [OPERATIONS.md](OPERATIONS.md).

## Остановка

```bash
docker compose down
```

Именованные volumes сохраняются. `docker compose down --volumes` удаляет данные PostgreSQL, Redis, Qdrant и локальную модель; используйте его только для осознанного сброса демонстрационного окружения.

## Ограничения

Compose-профиль не предназначен для production: нет TLS, HA, корпоративного IdP, централизованных секретов и автоматизированного backup. Целевая схема приведена в [INDUSTRIALIZATION.md](INDUSTRIALIZATION.md).
