# Деплой на Railway (UI в одном контейнере)

Схема сервисов (5 шт. — влезает в trial):

| Сервис Railway | Источник | Роль |
|----------------|----------|------|
| **web** | этот репозиторий, Dockerfile `deploy/railway/Dockerfile.web` | auth `/` + КТК `/app/` + admin `/admin/` |
| **auth-api** | тот же репо, `backend/Dockerfile` | авторизация `:8102` |
| **system-api** | тот же репо, `backend/Dockerfile` | gateway/storage/sim/ws |
| **Postgres** | Database → PostgreSQL | БД |
| **Redis** | Database → Redis | сессии / presence |

Публичный домен нужен **только у `web`**. Остальное — private networking.

## 1. Проект и GitHub

1. [railway.com](https://railway.com) → New Project → Empty Project.
2. Подключите GitHub-репозиторий.
3. Включите автодеплой на ветку `main` (Settings → Source → wait for CI optional).

## 2. Базы

- **+ New → Database → PostgreSQL**
- **+ New → Database → Redis**

Имена сервисов лучше оставить узнаваемыми (`Postgres`, `Redis`).

## 3. auth-api

1. **+ New → GitHub Repo** (тот же репозиторий).
2. Settings:
   - **Service name:** `auth-api`
   - **Builder:** Dockerfile
   - **Dockerfile path:** `backend/Dockerfile`
   - **Config-as-code (optional):** `deploy/railway/auth-api.railway.toml`
   - **Custom Start Command** (если не из toml):  
     `python -m backend.auth.app --host :: --port 8102`
3. Variables:

```text
KTK_HOST=::
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
KTK_ADMIN_LOGIN=<ваш логин>
KTK_ADMIN_NAME=Администратор
KTK_ADMIN_PASSWORD=<ваш пароль>
KTK_COOKIE_SECURE=1
```

Публичный домен **не** генерировать.

## 4. system-api

1. Ещё один сервис из того же GitHub Repo.
2. Settings:
   - **Service name:** `system-api`
   - **Builder:** Dockerfile
   - **Dockerfile path:** `backend/Dockerfile`
   - **Config-as-code (optional):** `deploy/railway/system-api.railway.toml`
   - **Custom Start Command** (если не из toml):  
     `python -m backend.run_system --host ::`
3. Variables:

```text
KTK_HOST=::
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
KTK_AUTH_URL=http://auth-api.railway.internal:8102
KTK_AUDIT_HMAC_SECRET=<случайная строка>
KTK_FASTAPI_PORT=8010
KTK_FASTAPI_URL=http://127.0.0.1:8010
KTK_CORS_ORIGINS=https://${{web.RAILWAY_PUBLIC_DOMAIN}}
```

Публичный домен **не** генерировать.  
К `system-api` можно примонтировать Volume на `/app/backend/runtime` (опционально).

## 5. web

1. Ещё один сервис из того же GitHub Repo **или** первый сервис после Connect
   (в корне уже есть `railway.toml` → `Dockerfile.web`).
2. Settings:
   - **Service name:** `web`
   - **Builder:** Dockerfile  
   - **Dockerfile path:** `deploy/railway/Dockerfile.web`  
     (если подхватился Nixpacks — переключите вручную; Config-as-code: `/railway.toml`)
3. Variables:

```text
API_HOST=system-api.railway.internal
GATEWAY_PORT=8000
FASTAPI_PORT=8010
PRESENCE_PORT=8106
AUTH_REDIRECT_PATH=/
DNS_RESOLVER=fd12::10
```

4. **Networking → Generate Domain** — это единственный публичный URL.

Маршруты после деплоя:

- `https://<domain>/` — вход  
- `https://<domain>/app/` — КТК  
- `https://<domain>/admin/` — админка  

## 6. Автообновление при коммите

У каждого сервиса из GitHub: **Settings → Source →** ветка `main`, автодеплой включён.  
Push в `main` пересоберёт `web` / `auth-api` / `system-api`.

Чтобы не дёргать все сервисы зря, задайте **Watch Paths**:

- `web`: `auth-frontend/**`, `frontend/**`, `admin-frontend/**`, `deploy/railway/**`
- `auth-api` / `system-api`: `backend/**`

## Замечания

- Trial: ~$5 / 30 дней, лимит 5 сервисов — эта схема как раз 5.
- После trial Free ($1/мес) стек не потянет; нужен Hobby.
- Локальный `docker-compose.yml` поднимает тот же `web` + API + Postgres + Redis.

## «Failed to build an image» — что проверить

Образ **собирается**, если задан правильный Dockerfile. Без этого Railway
часто запускает **Nixpacks** по корневому `package.json` (`npm run build` без
зависимостей frontend) или берёт `frontend/Dockerfile` (ожидает готовый `dist`
и падает).

1. Откройте упавший деплой → **View Logs** / Build Logs — пришлите хвост ошибки.
2. Для сервиса **web**:
   - **Settings → Build → Builder** = `Dockerfile`
   - **Dockerfile path** = `deploy/railway/Dockerfile.web`  
   - либо **Config-as-code** = `/railway.toml` (в корне репо уже настроен web)
3. Для **auth-api**:
   - Dockerfile = `backend/Dockerfile`
   - Config-as-code = `deploy/railway/auth-api.railway.toml`
4. Для **system-api**:
   - Dockerfile = `backend/Dockerfile`
   - Config-as-code = `deploy/railway/system-api.railway.toml`
5. Не указывайте `frontend/Dockerfile`, `admin-frontend/Dockerfile`,
   `auth-frontend/Dockerfile` — они только для старого локального сценария и
   **ломают** сборку из корня репозитория (нет `dist` в контексте).
6. После смены пути Dockerfile нажмите **Redeploy**.

Локальная проверка того же образа, что на Railway:

```bash
docker build -f deploy/railway/Dockerfile.web -t ktk-web .
docker build -f backend/Dockerfile -t ktk-api .
```
