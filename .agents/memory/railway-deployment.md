---
name: Railway deployment setup
description: How this project is configured to run on Railway.com
---

**Architecture on Railway:**
- Single service: Express server on `PORT` (set by Railway automatically)
- Serves API at `/api` AND static frontend at `/` (dashboard.html, config.html)
- No PHP on Railway — PHP files are for Replit local dev only; HTML files are for Railway
- puppeteer-real-browser with Xvfb for Cloudflare bypass

**Key files:**
- `Dockerfile` — node:20-slim + chromium + xvfb + builds entire pnpm workspace
- `railway.toml` — builder = DOCKERFILE, healthcheck at /api/healthz
- `.dockerignore` — excludes node_modules, mockup-sandbox, frontend/src
- `scripts/start.sh` — starts Xvfb on :99 then launches Node server

**Volume for credentials:**
- Mount a Railway volume at `/data`
- DATA_DIR env var = `/data` (set in Dockerfile ENV)
- credentials.json and config.json persist there across deploys

**Environment variables set in Dockerfile:**
- CHROMIUM_PATH=/usr/bin/chromium
- DISPLAY=:99
- NODE_ENV=production
- STATIC_DIR=/app/public
- DATA_DIR=/data

**Why:** Static dir is copied to /app/public during Docker build (`cp -r artifacts/frontend/public /app/public`). Express serves it when STATIC_DIR exists.

**How to apply:** In Railway dashboard: New Project → Deploy from GitHub → it finds railway.toml and uses Dockerfile automatically. Add Volume at mount path `/data`.
