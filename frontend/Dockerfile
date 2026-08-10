# Не используются Railway / docker-compose (единый UI: deploy/railway/Dockerfile.web).
# Сборка из корня репозитория намеренно падает — иначе легко получить
# «Failed to build an image» без dist.
FROM alpine:3.20
RUN printf '%s\n' \
  "Use deploy/railway/Dockerfile.web with build context = repository root." \
  "Example: docker build -f deploy/railway/Dockerfile.web -t ktk-web ." \
  > /message.txt \
 && cat /message.txt >&2 \
 && exit 1
