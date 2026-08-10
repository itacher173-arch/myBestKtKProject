# Деплой на Railway — 4 сервиса (trial)

Один `railway.toml` **не создаёт** Postgres/Redis/API.  
Подключение GitHub один раз = **один** сервис (у вас это `myBestKtKProject` = web).  
Остальное нужно добавить кнопкой **+ Create** в том же проекте.

## Итоговая схема

| Сервис Railway | Config / image | Роль |
|----------------|----------------|------|
| **web** (сейчас `myBestKtKProject`) | `/railway.toml` → `Dockerfile.web` | UI + прокси `/api` |
| **api** | `deploy/railway/api.railway.toml` | весь backend (`run_all`) |
| **Postgres** | Database → PostgreSQL | БД |
| **Redis** | Database → Redis | сессии |

Публичный домен — **только у web**.

## Что сделать в Railway (по шагам)

### 1. Переименовать web (удобно для переменных)

Карточка `myBestKtKProject` → ⋯ / Settings → Service Name → `web`  
(домен можно оставить как есть).

### 2. Postgres

**+ Create → Database → Add PostgreSQL**

### 3. Redis

**+ Create → Database → Add Redis**

### 4. api

**+ Create → GitHub Repo** → тот же `myBestKtKProject`  
Settings:

- Service name: `api`
- Config-as-code: `deploy/railway/api.railway.toml`  
  **или** вручную:
  - Builder: Dockerfile
  - Dockerfile path: `backend/Dockerfile`
  - Start command:  
    `python -m backend.run_all --host :: --gateway-port 8000 --auth-port 8102 --fastapi-port 8010 --presence-port 8106`
- Public Networking: **не** включать

Variables у `api`:

```text
KTK_HOST=::
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
KTK_AUTH_URL=http://127.0.0.1:8102
KTK_COOKIE_SECURE=1
KTK_ADMIN_LOGIN=admin
KTK_ADMIN_NAME=Администратор
KTK_ADMIN_PASSWORD=<придумайте пароль>
KTK_AUDIT_HMAC_SECRET=<случайная-строка>
KTK_FASTAPI_PORT=8010
KTK_FASTAPI_URL=http://127.0.0.1:8010
KTK_CORS_ORIGINS=https://${{web.RAILWAY_PUBLIC_DOMAIN}}
```

Если сервис web ещё называется `myBestKtKProject`, в `KTK_CORS_ORIGINS` используйте  
`https://${{myBestKtKProject.RAILWAY_PUBLIC_DOMAIN}}`.

### 5. Variables у web

```text
API_HOST=api.railway.internal
GATEWAY_PORT=8000
FASTAPI_PORT=8010
PRESENCE_PORT=8106
AUTH_REDIRECT_PATH=/
DNS_RESOLVER=fd12::10
```

После сохранения — **Redeploy** у `web` и `api`.

### 6. Открыть сайт

Networking у web → домен вида  
`https://mybestktkproject-production.up.railway.app`

- `/` — вход  
- `/app/` — КТК  
- `/admin/` — админка  

Логин админа: тот, что задали в `KTK_ADMIN_LOGIN` / `KTK_ADMIN_PASSWORD`.

## Почему раньше был только один Online

Railway показывает карточку на **каждый** сервис.  
Вы подключили репозиторий один раз → одна карточка.  
Пока не нажмёте **+ Create** ещё три раза (Postgres, Redis, api), других карточек не будет.  
Пересборка только `web` это не исправит.

## Опционально: схема из 5 сервисов

Как раньше: `auth-api` + `system-api` вместо единого `api`  
(конфиги `deploy/railway/auth-api.railway.toml` и `system-api.railway.toml`).  
На trial это тоже 5 слотов (web+auth+system+Postgres+Redis).  
Для старта проще единый `api`.
