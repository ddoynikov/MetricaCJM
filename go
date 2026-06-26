#!/bin/bash
cd "$(dirname "$0")"

PORT=8000

stop_server() {
  pkill -f "uvicorn app:app.*--port ${PORT}" 2>/dev/null || true
  if lsof -ti:"$PORT" >/dev/null 2>&1; then
    lsof -ti:"$PORT" | xargs kill -9 2>/dev/null || true
  fi
}

if lsof -ti:"$PORT" >/dev/null 2>&1 || pgrep -f "uvicorn app:app.*--port ${PORT}" >/dev/null 2>&1; then
  echo "Останавливаю сервер на порту $PORT…"
  stop_server
  for _ in 1 2 3 4 5; do
    lsof -ti:"$PORT" >/dev/null 2>&1 || break
    sleep 0.3
  done
fi

exec ./start.sh
