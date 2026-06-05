#!/bin/bash

# ── AFK Bot — Start All Services ─────────────────────────────────────────────

export DATA_DIR="${DATA_DIR:-$HOME/afkbot-data}"
export CHROMIUM_PATH="${CHROMIUM_PATH:-$(which chromium-browser 2>/dev/null || which chromium 2>/dev/null || echo '')}"
export PORT="${PORT:-3001}"
export DISPLAY="${DISPLAY:-:99}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "======================================"
echo "   AFK Bot Launcher"
echo "======================================"
echo "  API port  : $PORT"
echo "  PHP port  : 8080"
echo "  Data dir  : $DATA_DIR"
echo "  Chromium  : $CHROMIUM_PATH"
echo "  Display   : $DISPLAY"
echo "======================================"

# ── Create data dir ───────────────────────────────────────────────────────────
mkdir -p "$DATA_DIR"

# ── Kill existing sessions if any ────────────────────────────────────────────
tmux kill-session -t afk-api 2>/dev/null
tmux kill-session -t afk-web 2>/dev/null

# ── Kill leftover processes ───────────────────────────────────────────────────
pkill -f "dist/index.mjs" 2>/dev/null
pkill -f "php -S 0.0.0.0:8080" 2>/dev/null
pkill Xvfb 2>/dev/null
sleep 1

# ── Start Xvfb (virtual display for Chromium) ────────────────────────────────
echo "[1/3] Starting Xvfb virtual display..."
Xvfb :99 -screen 0 1280x720x24 &
sleep 1

# ── Start API server ──────────────────────────────────────────────────────────
echo "[2/3] Starting API server on port $PORT..."
tmux new-session -d -s afk-api -x 220 -y 50
tmux send-keys -t afk-api "
export DATA_DIR='$DATA_DIR'
export CHROMIUM_PATH='$CHROMIUM_PATH'
export PORT=$PORT
export DISPLAY=:99
cd '$SCRIPT_DIR/artifacts/api-server'
pnpm run start
" Enter

# Wait for API to be ready
echo "      Waiting for API to start..."
for i in $(seq 1 15); do
  sleep 1
  if curl -sf "http://localhost:$PORT/api/bot/status" > /dev/null 2>&1; then
    echo "      API is up!"
    break
  fi
  if [ $i -eq 15 ]; then
    echo "      API may still be starting — check: tmux attach -t afk-api"
  fi
done

# ── Start PHP frontend ────────────────────────────────────────────────────────
echo "[3/3] Starting frontend on port 8080..."
tmux new-session -d -s afk-web -x 220 -y 50
tmux send-keys -t afk-web "
cd '$SCRIPT_DIR/artifacts/frontend'
php -S 0.0.0.0:8080 -t public
" Enter

sleep 1

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo "======================================"
echo "   All services started!"
echo "======================================"

LOCAL_IP=$(ip addr show 2>/dev/null | grep "inet " | grep -v "127.0.0.1" | awk '{print $2}' | cut -d/ -f1 | head -1)
if [ -z "$LOCAL_IP" ]; then
  LOCAL_IP="YOUR_IP"
fi

echo ""
echo "  Dashboard : http://$LOCAL_IP:8080/dashboard.html"
echo "  Config    : http://$LOCAL_IP:8080/config.html"
echo "  API only  : http://$LOCAL_IP:$PORT/dashboard.html"
echo ""
echo "  Logs:"
echo "    tmux attach -t afk-api   (API server)"
echo "    tmux attach -t afk-web   (PHP frontend)"
echo ""
echo "  Stop all:"
echo "    tmux kill-session -t afk-api && tmux kill-session -t afk-web && pkill Xvfb"
echo "======================================"
