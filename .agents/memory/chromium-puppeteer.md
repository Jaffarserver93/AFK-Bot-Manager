---
name: Chromium path & puppeteer setup
description: How to launch Chromium in this Replit/NixOS environment for the bot
---

Use `puppeteer-core` (not `puppeteer-real-browser`) with the system Chromium.

**Why:** `puppeteer-real-browser` tries to manage its own browser launch and CDP connection on a random port, which fails in this sandboxed NixOS container with `ECONNREFUSED`. `puppeteer-core` with a direct `executablePath` works reliably.

**How to apply:** Pass `executablePath` to `puppeteer.launch()`:
```
/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium
```
(also aliased via `which chromium` / `which chromium-browser` on this system)

Required args for containerized environment:
- `--no-sandbox`, `--disable-setuid-sandbox`, `--disable-dev-shm-usage`, `--disable-gpu`, `--no-zygote`, `--single-process`

Use `waitUntil: "domcontentloaded"` instead of `"networkidle2"` for faster/more reliable navigation.
