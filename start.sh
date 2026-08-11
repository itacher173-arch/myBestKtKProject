#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

if [[ ! -f .env ]]; then
  if [[ ! -f .env.test ]]; then
    echo "Ошибка: не найдены .env и .env.test" >&2
    exit 1
  fi

  mv -- .env.test .env
  echo "Первый запуск: .env.test переименован в .env"
fi

docker compose up --build -d
docker compose ps
