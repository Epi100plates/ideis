#!/usr/bin/env bash
# Wgranie kodu na VPS i przebudowanie kontenera — jednym poleceniem.
#
#   ./deploy/push.sh                  # użyje danych z góry pliku
#   SSH_HOST=root@1.2.3.4 SSH_PORT=22 ./deploy/push.sh
#
# Skrypt wysyła tylko to, co potrzebne do obrazu (bez .git, .cache, docs),
# więc podmiana kodu zajmuje sekundę i nie rusza cache planów.
set -euo pipefail

SSH_HOST="${SSH_HOST:-root@olga322.mikrus.xyz}"
SSH_PORT="${SSH_PORT:-10322}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/mikrus_olga322}"
REMOTE_DIR="${REMOTE_DIR:-/opt/plany-wybor}"
APP_PORT="${APP_PORT:-3002}"

cd "$(dirname "$0")/.."

FILES=(package.json Dockerfile .dockerignore docker-compose.yml .env.example server public scripts deploy tests)
tar -czf /tmp/plany-wybor-src.tgz "${FILES[@]}"

scp -i "$SSH_KEY" -P "$SSH_PORT" /tmp/plany-wybor-src.tgz "$SSH_HOST:/tmp/plany-wybor-src.tgz"
rm -f /tmp/plany-wybor-src.tgz

ssh -i "$SSH_KEY" -p "$SSH_PORT" "$SSH_HOST" "
  set -e
  mkdir -p '$REMOTE_DIR'
  tar --no-same-owner -xzf /tmp/plany-wybor-src.tgz -C '$REMOTE_DIR'
  chmod 600 '$REMOTE_DIR/.env' 2>/dev/null || true
  chmod 755 '$REMOTE_DIR'/deploy/*.sh 2>/dev/null || true
  cd '$REMOTE_DIR'
  docker compose up -d --build
  sleep 3
  curl -fsS -m 20 http://127.0.0.1:$APP_PORT/health >/dev/null && echo '[push] OK — serwer zdrowy'
" 2>&1 | grep -vE '^\s*#|DONE|CACHED|transferring|exporting' || true

echo "[push] sprawdź: docker compose -f $REMOTE_DIR/docker-compose.yml ps"
