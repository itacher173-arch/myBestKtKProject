#!/usr/bin/env sh
set -eu
ROOT="$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

export VITE_APP_URL="${VITE_APP_URL:-/app/}"
export VITE_AUTH_URL="${VITE_AUTH_URL:-/}"

npm --prefix auth-frontend run build
npm --prefix frontend run build -- --base /app/
npm --prefix admin-frontend run build -- --base /admin/
