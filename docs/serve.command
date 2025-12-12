#!/bin/bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

PORT="${PORT:-8000}"

python3 -m http.server "$PORT" >/dev/null 2>&1 &
PID=$!
trap 'kill "$PID" >/dev/null 2>&1 || true' EXIT

sleep 0.3

if command -v open >/dev/null 2>&1; then
  open "http://localhost:${PORT}/"
else
  echo "Open: http://localhost:${PORT}/"
fi

wait "$PID"

