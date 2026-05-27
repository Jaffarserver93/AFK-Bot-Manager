FROM node:20-slim

# ── System deps: Chromium + Xvfb for puppeteer-real-browser ──────────────────
RUN apt-get update && apt-get install -y \
    chromium \
    chromium-sandbox \
    xvfb \
    x11-utils \
    ca-certificates \
    fonts-liberation \
    fonts-noto-color-emoji \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libgdk-pixbuf2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libxss1 \
    libxtst6 \
    xdg-utils \
    --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*

# ── pnpm ──────────────────────────────────────────────────────────────────────
RUN npm install -g pnpm@10

WORKDIR /app

# ── Workspace files (layer-cached before source copy) ─────────────────────────
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY lib/ lib/
COPY artifacts/ artifacts/
COPY scripts/ scripts/

# ── Install all workspace dependencies ────────────────────────────────────────
RUN pnpm install --frozen-lockfile --ignore-scripts \
  && pnpm approve-builds || true \
  && pnpm rebuild

# ── Build the API server ──────────────────────────────────────────────────────
RUN pnpm --filter @workspace/api-server run build

# ── Copy frontend static files to a predictable location ─────────────────────
RUN cp -r artifacts/frontend/public /app/public

# ── Startup script ────────────────────────────────────────────────────────────
RUN chmod +x /app/scripts/start.sh

# ── Persistent data volume (mount Railway volume here) ───────────────────────
RUN mkdir -p /data

# ── Environment ──────────────────────────────────────────────────────────────
ENV CHROMIUM_PATH=/usr/bin/chromium
ENV DISPLAY=:99
ENV NODE_ENV=production
ENV STATIC_DIR=/app/public
ENV DATA_DIR=/data

EXPOSE 8080

CMD ["/app/scripts/start.sh"]
