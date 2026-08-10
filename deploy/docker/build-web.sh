#!/usr/bin/env sh
set -eu
ROOT="$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

export VITE_APP_URL="${VITE_APP_URL:-/app/}"
export VITE_AUTH_URL="${VITE_AUTH_URL:-/}"

npm --prefix frontend/auth run build
npm --prefix frontend/trainer run build -- --base /app/
npm --prefix frontend/admin run build -- --base /admin/
