#!/bin/bash

# ── AFK Bot — Start All Services (Replit-compatible) ─────────────────────────

export DATA_DIR="${DATA_DIR:-$HOME/afkbot-data}"
export CHROMIUM_PATH="${CHROMIUM_PATH:-$(which chromium-browser 2>/dev/null || which chromium 2>/dev/null || echo '')}"
export PORT="${PORT:-3001}"
export DISPLAY="${DISPLAY:-:0}"
export STATIC_DIR="${STATIC_DIR:-$(pwd)/artifacts/frontend/public}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "======================================"
echo "   AFK Bot Launcher"
echo "======================================"
echo "  API port  : $PORT"
echo "  PHP port  : 8080"
echo "  Data dir  : $DATA_DIR"
echo "  Chromium  : $CHROMIUM_PATH"
echo "  Static    : $STATIC_DIR"
echo "======================================"

# ── Create data dir ───────────────────────────────────────────────────────────
mkdir -p "$DATA_DIR"

# ── Kill leftover processes ───────────────────────────────────────────────────
pkill -f "dist/index.mjs" 2>/dev/null
pkill -f "php -S 0.0.0.0:8080" 2>/dev/null
sleep 1

# ── Start API server in background ───────────────────────────────────────────
echo "[1/2] Starting API server on port $PORT..."
(
  export DATA_DIR="$DATA_DIR"
  export CHROMIUM_PATH="$CHROMIUM_PATH"
  export PORT="$PORT"
  export DISPLAY="$DISPLAY"
  export STATIC_DIR="$STATIC_DIR"
  cd "$SCRIPT_DIR/artifacts/api-server"
  pnpm run start
) &
API_PID=$!

# Wait for API to be ready
echo "      Waiting for API to start..."
for i in $(seq 1 20); do
  sleep 1
  if curl -sf "http://localhost:$PORT/api/bot/status" > /dev/null 2>&1; then
    echo "      API is up! (${i}s)"
    break
  fi
  if [ $i -eq 20 ]; then
    echo "      API still starting — proceeding anyway."
  fi
done

# ── Start PHP frontend in foreground (keeps workflow alive) ──────────────────
echo "[2/2] Starting frontend on port 8080..."
echo ""
echo "======================================"
echo "   All services started!"
echo "======================================"
echo "  Dashboard : /dashboard.html"
echo "  Config    : /config.html"
echo "======================================"

# Trap SIGTERM/SIGINT to clean up background API process
trap "kill $API_PID 2>/dev/null; exit 0" SIGTERM SIGINT

cd "$SCRIPT_DIR/artifacts/frontend"
php -S 0.0.0.0:8080 -t public
