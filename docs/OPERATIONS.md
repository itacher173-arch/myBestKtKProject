# Эксплуатационный runbook

Runbook относится к локальному Docker Compose-прототипу. Production-процедуры должны быть реализованы средствами корпоративной платформы.

## Проверка состояния

```bash
docker compose ps
curl --fail http://localhost:8000/api/health
docker compose logs --tail=100 web system-api auth-api ai-api
```

В нормальном состоянии обязательные сервисы имеют `running`/`healthy`. AI может работать в fallback-режиме; используемый режим проверяется в health и ответах анализа.

## Диагностическая последовательность

1. проверить `docker compose config --quiet`;
2. проверить занятость портов `8080` и `8000`;
3. проверить `postgres` и `redis`;
4. проверить `auth-api`, затем `system-api`;
5. проверить `qdrant`, `rag-api`, `ml-recommender`, `llm-server` и `ai-api`;
6. проверить Nginx `web` и запрос из браузера;
7. зафиксировать время, commit SHA, Compose-конфигурацию и релевантные логи.

Секреты и пользовательские данные перед передачей логов удаляются.

## Логи

```bash
docker compose logs --since=15m system-api
docker compose logs --since=15m auth-api
docker compose logs --since=15m ai-api rag-api ml-recommender llm-server
```

Не публикуйте полный `.env`, cookie, Bearer-токены, дампы БД или содержимое учебных сессий в issue.

## Backup прототипа

PostgreSQL:

```bash
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > ktk-backup.dump
```

Конфигурация и версии:

```bash
git rev-parse HEAD
docker compose config --images
```

Qdrant, Redis и модель размещаются в отдельных volumes. Для демонстрационного прототипа индекс знаний допускается пересоздать из версионированного каталога; Redis не является источником постоянных отчётов. В production используются штатные snapshot/backup-механизмы платформы.

## Restore PostgreSQL

Восстановление выполняйте только в остановленное или изолированное окружение после проверки файла backup:

```bash
docker compose exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' < ktk-backup.dump
```

После восстановления проверьте health, вход, список пользователей, отчёты и HMAC-цепочку аудита.

## Обновление и rollback

Перед обновлением зафиксируйте текущий commit SHA и создайте backup. После развёртывания выполните smoke-проверку из [TESTING.md](TESTING.md).

Если внедрение неуспешно:

```bash
git checkout <предыдущий_проверенный_SHA>
docker compose up --build -d
docker compose ps
```

При несовместимой миграции восстановите согласованный backup. Rollback считается завершённым только после проверки входа, симуляции, чтения отчётов, базы знаний, аудита и AI-off режима.

## Инцидент безопасности

1. ограничить доступ к окружению;
2. не удалять логи и следы;
3. сменить скомпрометированные секреты и завершить сессии;
4. сохранить commit SHA, образы и временную линию;
5. сообщить по процедуре [SECURITY.md](../SECURITY.md);
6. не публиковать детали уязвимости в открытом issue до исправления.

## Production-требования

Для production обязательны автоматизированные backup/PITR, регулярные restore drills, SLO, централизованные логи, мониторинг, SIEM, Vault, подписанные образы, реестр изменений и утверждённая матрица эскалации.
