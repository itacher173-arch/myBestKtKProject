# Frontend

Frontend разделён на три React 18 + TypeScript + Vite приложения. Контейнерная сборка централизована: единый multi-stage образ собирает приложения независимо и публикует их одним Nginx.

| Приложение | Маршрут | Назначение | Dev-порт |
| --- | --- | --- | ---: |
| `auth` | `/` | вход обучаемого и инструктора | 5175 |
| `trainer` | `/app/` | тренажёр, обучение, знания и результаты | 5173 |
| `admin` | `/admin/` | пользователи, роли и группы | 5174 |

## Сборка

```bash
npm ci --prefix frontend/trainer
npm run build --prefix frontend/trainer
npm ci --prefix frontend/auth
npm run build --prefix frontend/auth
npm ci --prefix frontend/admin
npm run build --prefix frontend/admin
```

Не запускайте `npm install` для обновления зависимостей без намеренного изменения соответствующего `package-lock.json`.

Контейнерная сборка определяется только в [`deploy/docker/Dockerfile.web`](../deploy/docker/Dockerfile.web), маршрутизация — в [`deploy/docker/nginx.conf.template`](../deploy/docker/nginx.conf.template).

## Общие правила

- API вызывается через `/api`, без прямых ссылок на внутренние сервисы;
- токены, пароли и технологические данные не логируются;
- доступ проверяется backend, скрытие элемента интерфейса не является авторизацией;
- шрифты, изображения и схемы поставляются локально;
- пользовательские настройки не должны изменять детерминированную оценку;
- новые экраны проверяются с клавиатурой, масштабом 200 %, светлой/тёмной темой и понятными ошибками.

Графика описана в [`ASSETS.md`](ASSETS.md), API — в [`docs/API.md`](../docs/API.md).
