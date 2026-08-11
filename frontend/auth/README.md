# Auth UI

Портал входа обучаемого и инструктора. Администратор перенаправляется в `/admin/`.

```bash
npm ci
npm run dev
npm run build
```

Запросы отправляются на `/api/auth/*` с `credentials: include`. Сессионная политика принадлежит backend. До production клиентский fallback токена в `sessionStorage` должен быть заменён корпоративным OIDC/BFF-потоком.
