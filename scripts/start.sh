#!/bin/sh
set -e

# ── Start Xvfb virtual display (required by puppeteer-real-browser) ───────────
echo "[start] Starting Xvfb on display :99 ..."
Xvfb :99 -screen 0 1280x720x24 -ac +extension GLX +render -noreset &
XVFB_PID=$!

# Wait for Xvfb to be ready
sleep 2

if kill -0 "$XVFB_PID" 2>/dev/null; then
  echo "[start] Xvfb running (PID: $XVFB_PID)"
else
  echo "[start] WARNING: Xvfb may not have started cleanly"
fi

# ── Start the API + static server ─────────────────────────────────────────────
echo "[start] Starting API server on port ${PORT:-8080} ..."
cd /app/artifacts/api-server
exec node --enable-source-maps ./dist/index.mjs
