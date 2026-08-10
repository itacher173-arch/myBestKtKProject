#!/bin/sh
set -eu

export PORT="${PORT:-8080}"
# Compose default: system-api
export API_HOST="${API_HOST:-system-api}"
export GATEWAY_PORT="${GATEWAY_PORT:-8000}"
export FASTAPI_PORT="${FASTAPI_PORT:-8010}"
export PRESENCE_PORT="${PRESENCE_PORT:-8106}"
export AUTH_REDIRECT_PATH="${AUTH_REDIRECT_PATH:-/}"
# Compose Docker DNS
export DNS_RESOLVER="${DNS_RESOLVER:-127.0.0.11}"

envsubst '${PORT} ${API_HOST} ${GATEWAY_PORT} ${FASTAPI_PORT} ${PRESENCE_PORT} ${AUTH_REDIRECT_PATH} ${DNS_RESOLVER}' \
  < /etc/nginx/templates/default.conf.template \
  > /etc/nginx/conf.d/default.conf

exec nginx -g 'daemon off;'
