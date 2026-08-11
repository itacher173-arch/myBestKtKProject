# Развёртывание

Каталог содержит Docker-артефакты локального прототипа.

- `docker/Dockerfile.web` — multi-stage сборка `auth`, `trainer`, `admin` и runtime Nginx;
- `docker/nginx.conf.template` — маршрутизация UI, API и WebSocket;
- `docker/docker-entrypoint-web.sh` — формирование runtime-конфигурации.

Основная конфигурация сервисов находится в корневом [`docker-compose.yml`](../docker-compose.yml). Запуск и эксплуатация описаны в [`docs/DEPLOYMENT.md`](../docs/DEPLOYMENT.md) и [`docs/OPERATIONS.md`](../docs/OPERATIONS.md).

Эти файлы не являются production-манифестами. Перед корпоративным внедрением необходимы Kubernetes-манифесты/Helm, Ingress/WAF, NetworkPolicy, Pod Security, resource limits, probes, autoscaling, Vault, registry policy и подписанные образы.
