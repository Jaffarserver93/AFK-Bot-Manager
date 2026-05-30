import { createRequire } from "module";
import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { logger } from "../lib/logger.js";

const _require = createRequire(import.meta.url);

const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), "data");
const CREDENTIALS_FILE = path.join(DATA_DIR, "credentials.json");
const CONFIG_FILE = path.join(DATA_DIR, "config.json");

const CHROMIUM_PATH =
  process.env.CHROMIUM_PATH ||
  "/usr/bin/chromium" ||
  "/usr/bin/chromium-browser";

const BASE_CHROMIUM_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--window-size=1280,720",
  "--disable-default-apps",
  "--disable-sync",
  "--mute-audio",
  // NOTE: --disable-background-networking is intentionally removed — it prevents
  // ad scripts from loading, triggering ad-blocker detection on some sites.
];

export interface Credentials {
  loginUrl: string;
  targetUrl: string;
  username: string;
  password: string;
}

export interface ProxyConfig {
  enabled: boolean;
  host: string;
  port: number;
  username: string;
  password: string;
  country: string;
}

export interface Config {
  screenshotInterval: number;
  theme: string;
  proxy: ProxyConfig;
}

export interface LogEntry {
  time: string;
  message: string;
  level: "info" | "warn" | "error";
}

type SSEClient = {
  res: import("express").Response;
  id: string;
};

const DEFAULT_PROXY: ProxyConfig = {
  enabled: false,
  host: "dc.oxylabs.io",
  port: 8000,
  username: "jxfrjxfr_m3SkL",
  password: "IE6+AI+t47UssA",
  country: "US",
};

class BotManager {
  private browser: any = null;
  private page: any = null;
  private startTime: Date | null = null;
  private screenshotTimer: ReturnType<typeof setInterval> | null = null;
  private afkTimer: ReturnType<typeof setTimeout> | null = null;
  private popupDismissTimer: ReturnType<typeof setInterval> | null = null;
  private reloadTimer: ReturnType<typeof setInterval> | null = null;
  private _timeRemaining: string = "--:--";
  private _timeRemainingMinutes: number = -1;
  private latestScreenshot: string = "";
  private logs: LogEntry[] = [];
  private sseClients: Map<string, SSEClient> = new Map();
  private _status: "idle" | "starting" | "running" | "stopping" = "idle";
  public _reloadLoopStartedAt: number = 0;
  public reloadIntervalMs: number = 60000;
  private _lastHealthyAt: number = 0;
  private _healthWatchdog: ReturnType<typeof setInterval> | null = null;
  private _autoRestartCount: number = 0;

  get status() {
    return this._status;
  }

  get uptime(): number {
    if (!this.startTime) return 0;
    return Math.floor((Date.now() - this.startTime.getTime()) / 1000);
  }

  get timeRemaining(): string {
    return this._timeRemaining;
  }

  get timeRemainingMinutes(): number {
    return this._timeRemainingMinutes;
  }

  addSSEClient(id: string, res: import("express").Response) {
    this.sseClients.set(id, { res, id });
    res.on("close", () => {
      this.sseClients.delete(id);
    });
  }

  private emitLog(entry: LogEntry) {
    this.logs.push(entry);
    if (this.logs.length > 300) this.logs.shift();
    const payload = JSON.stringify(entry);
    for (const client of this.sseClients.values()) {
      try {
        client.res.write(`data: ${payload}\n\n`);
      } catch {
        this.sseClients.delete(client.id);
      }
    }
  }

  log(message: string, level: LogEntry["level"] = "info") {
    const entry: LogEntry = {
      time: new Date().toISOString(),
      message,
      level,
    };
    this.emitLog(entry);
    if (level === "error") {
      logger.error(message);
    } else if (level === "warn") {
      logger.warn(message);
    } else {
      logger.info(message);
    }
  }

  getLogs(): LogEntry[] {
    return this.logs;
  }

  getLatestScreenshot(): string {
    return this.latestScreenshot;
  }

  async readCredentials(): Promise<Credentials> {
    await mkdir(DATA_DIR, { recursive: true });
    if (!existsSync(CREDENTIALS_FILE)) {
      return {
        loginUrl: "https://www.bytenut.com/auth/login",
        targetUrl: "https://www.bytenut.com/free-gamepanel/317333e3",
        username: "",
        password: "",
      };
    }
    const raw = await readFile(CREDENTIALS_FILE, "utf8");
    return JSON.parse(raw) as Credentials;
  }

  async writeCredentials(creds: Credentials): Promise<void> {
    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(CREDENTIALS_FILE, JSON.stringify(creds, null, 2), "utf8");
  }

  async readConfig(): Promise<Config> {
    await mkdir(DATA_DIR, { recursive: true });
    if (!existsSync(CONFIG_FILE)) {
      return { screenshotInterval: 1000, theme: "cyberpunk", proxy: DEFAULT_PROXY };
    }
    const raw = await readFile(CONFIG_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<Config>;
    return {
      screenshotInterval: parsed.screenshotInterval ?? 1000,
      theme: parsed.theme ?? "cyberpunk",
      proxy: { ...DEFAULT_PROXY, ...(parsed.proxy ?? {}) },
    };
  }

  async writeConfig(config: Config): Promise<void> {
    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), "utf8");
  }

  async start(): Promise<void> {
    if (this._status !== "idle") {
      throw new Error(`Bot is already ${this._status}`);
    }
    this._status = "starting";
    this.log("Initializing bot runner...");

    try {
      const creds = await this.readCredentials();
      const config = await this.readConfig();

      if (!creds.username || !creds.password) {
        this._status = "idle";
        throw new Error(
          "Username and password are required. Please configure credentials first."
        );
      }

      // ── Build Chromium args, injecting proxy if enabled ──────────────────────
      const chromiumArgs = [...BASE_CHROMIUM_ARGS];
      const proxy = config.proxy;

      if (proxy.enabled) {
        const proxyUrl = `https://${proxy.host}:${proxy.port}`;
        chromiumArgs.push(`--proxy-server=${proxyUrl}`);
        this.log(
          `Proxy enabled: ${proxy.host}:${proxy.port} (country: ${proxy.country})`
        );
      } else {
        this.log("Proxy disabled — using direct connection.");
      }

      this.log("Loading puppeteer-real-browser for Cloudflare bypass...");

      let connectFn: any;
      try {
        const mod = _require("puppeteer-real-browser");
        connectFn = mod.connect;
      } catch (err: any) {
        this._status = "idle";
        throw new Error(
          `Failed to load puppeteer-real-browser: ${err.message}`
        );
      }

      this.log(`Launching Chromium: ${CHROMIUM_PATH}`);

      const result = await connectFn({
        headless: false,
        args: chromiumArgs,
        customConfig: {
          executablePath: CHROMIUM_PATH,
        },
        turnstile: true,
        connectOption: {
          defaultViewport: { width: 1280, height: 720 },
        },
        disableXvfb: true,
        ignoreAllFlags: false,
      });

      this.browser = result.browser;
      this.page = result.page;

      await this.page.setViewport({ width: 1280, height: 720 });

      // ── Authenticate proxy if enabled ────────────────────────────────────────
      if (proxy.enabled) {
        const proxyUser = `user-${proxy.username}-country-${proxy.country}`;
        await this.page.authenticate({
          username: proxyUser,
          password: proxy.password,
        });
        this.log(`Proxy auth set for user: ${proxyUser}`);
      }

      // ── Inject ad-spoof script before ANY page JS runs ──────────────────────
      // This fakes the presence of ads so the site's ad-blocker detector
      // never triggers, regardless of what Chromium flags are active.
      await this.page.evaluateOnNewDocument(() => {
        // Fake Google AdSense globals
        (window as any).adsbygoogle = (window as any).adsbygoogle || {
          loaded: true,
          push: () => {},
        };

        // Fake Google Publisher Tag
        (window as any).googletag = (window as any).googletag || {
          cmd: { push: (fn: any) => fn() },
          pubads: () => ({
            enableSingleRequest: () => {},
            collapseEmptyDivs: () => {},
            setTargeting: () => {},
            addEventListener: () => {},
            refresh: () => {},
          }),
          defineSlot: () => ({ addService: () => ({}) }),
          enableServices: () => {},
          display: () => {},
          destroySlots: () => {},
        };

        // Common ad-blocker detection flags
        (window as any).canRunAds = true;
        (window as any).adblockDetected = false;
        (window as any).__adblockEnabled = false;
        (window as any).isAdBlockActive = false;

        // Create a hidden fake ad element that detectors look for
        const fakeAd = document.createElement("div");
        fakeAd.className = "ad ads adsbox ad-unit doubleclick adsbygoogle";
        fakeAd.id = "ad-block-test-element";
        fakeAd.style.cssText =
          "height:1px;width:1px;position:absolute;left:-9999px;top:-9999px;opacity:0.01;";
        fakeAd.innerHTML = "&nbsp;";
        document.documentElement.appendChild(fakeAd);

        // Intercept setInterval/setTimeout to neutralize ad-blocker re-check timers
        const _origSetInterval = window.setInterval;
        (window as any).setInterval = function (fn: any, delay: any, ...args: any[]) {
          const fnStr = typeof fn === "function" ? fn.toString() : String(fn);
          if (
            fnStr.includes("adblock") ||
            fnStr.includes("adBlock") ||
            fnStr.includes("AdBlock") ||
            fnStr.includes("ad_block") ||
            fnStr.includes("detectAd") ||
            fnStr.includes("adblocker") ||
            fnStr.includes("canRunAds")
          ) {
            return 0; // suppress the timer
          }
          return _origSetInterval(fn, delay, ...args);
        };
      });

      this.log("Ad-spoof script injected (runs before page JS on every navigation).");
      this.log("Chromium launched successfully.");
      this.log(`Navigating to login URL: ${creds.loginUrl}`);

      // Allow extra time — Cloudflare may take 5–15s to verify before showing login page
      await this.page.goto(creds.loginUrl, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });

      // ── Wait for Cloudflare to pass and the real login form to appear ─────────
      this.log("Waiting for login form (Cloudflare may be verifying)...");
      const formReady = await this.page.waitForFunction(
        () => {
          const body = document.body?.innerText || "";
          // Still on Cloudflare challenge — keep waiting
          if (
            body.includes("Verifying you are human") ||
            body.includes("Just a moment") ||
            body.includes("Please wait") ||
            body.includes("Checking your browser")
          ) return false;
          // Login form is present when a password input exists
          return !!document.querySelector('input[type="password"]');
        },
        { timeout: 90000, polling: 1500 }
      ).catch(() => null);

      if (!formReady) {
        this.log("Login form not found after waiting — proceeding anyway.", "warn");
      } else {
        this.log("Login form detected. Filling credentials...");
      }

      // Small buffer for React/Vue to finish hydrating the form
      await new Promise((r) => setTimeout(r, 800));

      // ── Find input selectors via DOM inspection ───────────────────────────────
      const selectors = await this.page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll("input")) as HTMLInputElement[];
        const userInput = inputs.find(
          (i) =>
            i.type === "email" ||
            i.name?.toLowerCase().includes("email") ||
            i.name?.toLowerCase().includes("user") ||
            i.id?.toLowerCase().includes("email") ||
            i.id?.toLowerCase().includes("user") ||
            i.placeholder?.toLowerCase().includes("email") ||
            i.placeholder?.toLowerCase().includes("username")
        );
        const passInput = inputs.find(
          (i) =>
            i.type === "password" ||
            i.name?.toLowerCase().includes("pass") ||
            i.id?.toLowerCase().includes("pass")
        );
        const submitBtn = Array.from(
          document.querySelectorAll("button, input[type=submit]")
        ).find((b: any) => {
          const txt = (b.textContent || b.value || "").toLowerCase();
          return (
            txt.includes("login") ||
            txt.includes("sign in") ||
            txt.includes("log in") ||
            b.type === "submit"
          );
        }) as HTMLElement | undefined;

        return {
          userSel: userInput
            ? userInput.id
              ? `#${CSS.escape(userInput.id)}`
              : userInput.name
              ? `input[name="${userInput.name}"]`
              : 'input[type="email"],input[type="text"]'
            : 'input[type="email"],input[type="text"]',
          passSel: passInput
            ? passInput.id
              ? `#${CSS.escape(passInput.id)}`
              : passInput.name
              ? `input[name="${passInput.name}"]`
              : 'input[type="password"]'
            : 'input[type="password"]',
          submitSel: submitBtn
            ? submitBtn.id
              ? `#${CSS.escape(submitBtn.id)}`
              : null
            : null,
        };
      }).catch(() => ({
        userSel: 'input[type="email"],input[type="text"]',
        passSel: 'input[type="password"]',
        submitSel: null,
      }));

      this.log(`Using selectors — user: ${selectors.userSel} | pass: ${selectors.passSel}`);

      // ── Fill username with real keystrokes ────────────────────────────────────
      try {
        await this.page.click(selectors.userSel, { clickCount: 3 });
        await this.page.keyboard.type(creds.username, { delay: 40 });
      } catch {
        // Fallback: direct value injection
        await this.page.evaluate((sel: string, val: string) => {
          const el = document.querySelector(sel) as HTMLInputElement | null;
          if (!el) return;
          el.focus();
          el.value = val;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }, selectors.userSel, creds.username);
      }

      await new Promise((r) => setTimeout(r, 300));

      // ── Fill password with real keystrokes ────────────────────────────────────
      try {
        await this.page.click(selectors.passSel, { clickCount: 3 });
        await this.page.keyboard.type(creds.password, { delay: 40 });
      } catch {
        await this.page.evaluate((sel: string, val: string) => {
          const el = document.querySelector(sel) as HTMLInputElement | null;
          if (!el) return;
          el.focus();
          el.value = val;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }, selectors.passSel, creds.password);
      }

      await new Promise((r) => setTimeout(r, 300));
      this.log("Credentials filled. Submitting login form...");

      // ── Submit — try button click, fall back to Enter key ────────────────────
      if (selectors.submitSel) {
        await this.page.click(selectors.submitSel).catch(() => {});
      } else {
        // Click the submit button by text, or press Enter on password field
        const clicked = await this.page.evaluate(() => {
          const btn = Array.from(
            document.querySelectorAll("button, input[type=submit]")
          ).find((b: any) => {
            const txt = (b.textContent || b.value || "").toLowerCase();
            return txt.includes("login") || txt.includes("sign in") || txt.includes("log in") || b.type === "submit";
          }) as HTMLElement | undefined;
          if (btn) { btn.click(); return true; }
          return false;
        });
        if (!clicked) {
          await this.page.keyboard.press("Enter");
        }
      }

      // Wait for either navigation or SPA route change
      await Promise.race([
        this.page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 12000 }),
        new Promise((r) => setTimeout(r, 4000)),
      ]).catch(() => {});

      // SPA settle time
      await new Promise((r) => setTimeout(r, 2000));

      const urlAfterSubmit = this.page.url();
      this.log(`Login submitted. Current URL: ${urlAfterSubmit}`);

      const isStillOnLogin =
        urlAfterSubmit.toLowerCase().includes("/auth/login") ||
        urlAfterSubmit.toLowerCase().includes("/login");

      if (isStillOnLogin) {
        const hasError = await this.page.evaluate(() => {
          const body = document.body?.innerText?.toLowerCase() || "";
          return (
            body.includes("invalid") ||
            body.includes("incorrect") ||
            body.includes("wrong password") ||
            body.includes("error")
          );
        }).catch(() => false);

        if (hasError) {
          this.log("Login may have failed — error text detected on page.", "warn");
        } else {
          this.log("Login submitted — URL unchanged (SPA routing, this is normal).");
        }
      } else {
        this.log("Logged in successfully.");
      }

      this.log(`Navigating to target URL: ${creds.targetUrl}`);
      await this.page.goto(creds.targetUrl, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      // Dismiss any popup overlays (ad blocker detection, cookie banners, etc.)
      await this.dismissPopups();
      await new Promise((r) => setTimeout(r, 1000));
      await this.dismissPopups();

      this.log("Target URL loaded. Bot is now active.");

      this._status = "running";
      this.startTime = new Date();

      this._lastHealthyAt = Date.now();
      this.startScreenshotLoop(config.screenshotInterval);
      this.startAfkLoop();
      this.startPopupDismissLoop();
      this.startReloadLoop();
      this.startHealthWatchdog();
    } catch (err: any) {
      this._status = "idle";
      this.log(`Bot failed to start: ${err.message}`, "error");
      await this.cleanup();
      throw err;
    }
  }

  private async dismissPopups(): Promise<void> {
    if (!this.page) return;
    try {
      const dismissed = await this.page.evaluate(() => {
        let count = 0;

        // 1. Remove elements that contain "Ad Blocker" text (modal overlays)
        const allElements = Array.from(document.querySelectorAll("*")) as HTMLElement[];
        for (const el of allElements) {
          const text = el.innerText || "";
          if (
            text.includes("Ad Blocker Detected") ||
            text.includes("AdBlock Detected") ||
            text.includes("ad blocker") ||
            text.includes("Please disable your ad blocker")
          ) {
            // Walk up to find the modal/overlay root (fixed/absolute positioned ancestor)
            let target: HTMLElement | null = el;
            while (target && target !== document.body) {
              const style = window.getComputedStyle(target);
              if (
                style.position === "fixed" ||
                style.position === "absolute" ||
                target.classList.toString().toLowerCase().includes("modal") ||
                target.classList.toString().toLowerCase().includes("overlay") ||
                target.classList.toString().toLowerCase().includes("popup") ||
                target.classList.toString().toLowerCase().includes("dialog")
              ) {
                target.remove();
                count++;
                break;
              }
              target = target.parentElement;
            }
            // If no positioned ancestor found, remove the element itself
            if (target === document.body && el.parentElement) {
              el.remove();
              count++;
            }
          }
        }

        // 2. Remove common backdrop/overlay elements that block the page
        const overlaySelectors = [
          "[class*='overlay']",
          "[class*='modal']",
          "[class*='popup']",
          "[class*='adblock']",
          "[class*='ad-block']",
          "[id*='adblock']",
          "[id*='ad-block']",
          "[id*='overlay']",
          "[id*='modal']",
        ];
        for (const sel of overlaySelectors) {
          try {
            document.querySelectorAll(sel).forEach((el: any) => {
              const style = window.getComputedStyle(el);
              if (style.position === "fixed" || style.position === "absolute") {
                el.remove();
                count++;
              }
            });
          } catch {}
        }

        // 3. Re-enable scroll if blocked by overlay
        if (count > 0) {
          document.body.style.overflow = "auto";
          document.documentElement.style.overflow = "auto";
        }

        return count;
      });

      if (dismissed > 0) {
        this.log(`Dismissed ${dismissed} popup overlay(s) — ad blocker detection removed.`);
      }
    } catch {
      // ignore — page may have navigated
    }
  }

  private startScreenshotLoop(intervalMs: number) {
    if (this.screenshotTimer) clearInterval(this.screenshotTimer);
    const captureScreenshot = async () => {
      if (!this.page || this._status !== "running") return;
      try {
        const buffer = await this.page.screenshot({ type: "jpeg", quality: 70 });
        this.latestScreenshot = Buffer.from(buffer).toString("base64");
        this._lastHealthyAt = Date.now(); // mark page is alive
      } catch {
        // ignore — detached frame / transient errors are handled by reload + watchdog
      }
    };
    captureScreenshot();
    this.screenshotTimer = setInterval(
      captureScreenshot,
      Math.max(100, intervalMs)
    );
  }

  private startAfkLoop() {
    if (this.afkTimer) clearTimeout(this.afkTimer);
    const randomInterval = () => Math.floor(Math.random() * 120000) + 60000;

    let afkCycleCount = 0;

    const doAfkAction = async () => {
      if (!this.page || this._status !== "running") return;
      try {
        const viewport = this.page.viewport() || { width: 1280, height: 720 };
        const x = Math.floor(Math.random() * viewport.width);
        const y = Math.floor(Math.random() * viewport.height);
        await this.page.mouse.move(x, y);
        await this.page.evaluate(() =>
          window.scrollBy(0, Math.random() * 100 - 50)
        );
        this._lastHealthyAt = Date.now();
        this.log("Anti-AFK action executed (mouse moved, page scrolled).");
      } catch (err: any) {
        if (this.isDetachedError(err)) {
          this.log("Anti-AFK: frame detached — recovering page...", "warn");
          const recovered = await this.recoverPage();
          if (recovered) {
            const creds = await this.readCredentials().catch(() => null);
            if (creds?.targetUrl) {
              try {
                await this.page!.goto(creds.targetUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
                await this.dismissPopups();
                this.log("Anti-AFK: recovered and back on target page.");
              } catch { /**/ }
            }
          }
        } else {
          this.log("Anti-AFK action failed — page may have changed.", "warn");
        }
      }

      // Dismiss popups every 3 AFK cycles (~3–6 min)
      afkCycleCount++;
      if (afkCycleCount % 3 === 0) {
        await this.dismissPopups();
      }
      if (this._status === "running") {
        this.afkTimer = setTimeout(doAfkAction, randomInterval());
      }
    };

    this.afkTimer = setTimeout(doAfkAction, randomInterval());
  }

  async stop(): Promise<void> {
    if (this._status === "idle") return;
    this._status = "stopping";
    this.log("Stopping bot...");
    await this.cleanup();
    this._status = "idle";
    this.startTime = null;
    this.latestScreenshot = "";
    this.log("Bot stopped.");
  }

  async restart(): Promise<void> {
    this.log("Restarting bot...");
    await this.stop();
    await this.start();
  }

  async updateScreenshotInterval(ms: number): Promise<void> {
    if (this._status === "running") {
      this.startScreenshotLoop(ms);
    }
  }

  private startHealthWatchdog(): void {
    if (this._healthWatchdog) clearInterval(this._healthWatchdog);
    const STUCK_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

    this._healthWatchdog = setInterval(async () => {
      if (this._status !== "running") return;

      const stuckMs = Date.now() - this._lastHealthyAt;
      if (stuckMs < STUCK_THRESHOLD_MS) return;

      const stuckMin = Math.floor(stuckMs / 60000);
      this._autoRestartCount++;
      this.log(
        `⚠ Bot has been unresponsive for ${stuckMin} min — triggering auto-restart #${this._autoRestartCount}...`,
        "error"
      );

      try {
        // Use restart() directly — it stops, cleans up, and re-launches
        await this.restart();
      } catch (err: any) {
        this.log(`Auto-restart #${this._autoRestartCount} failed: ${err.message}`, "error");
      }
    }, 60000); // check every minute
  }

  private startPopupDismissLoop(): void {
    if (this.popupDismissTimer) clearInterval(this.popupDismissTimer);
    // Run every 10 seconds — catches popups re-injected by site timers
    this.popupDismissTimer = setInterval(async () => {
      if (this._status !== "running") return;
      await this.dismissPopups();
    }, 10000);
  }

  private isDetachedError(err: any): boolean {
    const msg: string = err?.message || "";
    return (
      msg.includes("detached Frame") ||
      msg.includes("detached") ||
      msg.includes("Target closed") ||
      msg.includes("Session closed") ||
      msg.includes("Protocol error") ||
      msg.includes("context was destroyed") ||
      msg.includes("Execution context was destroyed")
    );
  }

  private async recoverPage(): Promise<boolean> {
    if (!this.browser) return false;
    try {
      const pages: any[] = await this.browser.pages();
      if (!pages || pages.length === 0) {
        this.log("Recovery: no open pages found in browser.", "warn");
        return false;
      }
      // Prefer the page with the target URL, else take the last open page
      const creds = await this.readCredentials().catch(() => null);
      const targetUrl = creds?.targetUrl || "";
      let best: any = null;
      for (const p of pages) {
        try {
          const url = p.url() || "";
          if (targetUrl && url.includes(targetUrl.replace(/^https?:\/\//, "").split("/")[0])) {
            best = p;
            break;
          }
          best = p; // fallback: last page wins
        } catch { /**/ }
      }
      if (!best) return false;
      this.page = best;
      this.log("Page recovered from browser session.", "warn");
      return true;
    } catch (err: any) {
      this.log(`recoverPage failed: ${err.message}`, "warn");
      return false;
    }
  }

  getCurrentUrl(): string {
    if (!this.page) return "";
    try {
      return this.page.url() || "";
    } catch {
      return "";
    }
  }

  async getPageStatus(): Promise<{ currentUrl: string; targetUrl: string; onTarget: boolean }> {
    const creds = await this.readCredentials();
    const currentUrl = this.getCurrentUrl();
    const target = creds.targetUrl || "";
    const onTarget = !!currentUrl && !!target && currentUrl.replace(/\/$/, "") === target.replace(/\/$/, "");
    return { currentUrl, targetUrl: target, onTarget };
  }

  async navigateToTarget(): Promise<void> {
    if (!this.page || this._status !== "running") return;
    const creds = await this.readCredentials();
    if (!creds.targetUrl) return;
    this.log(`Navigating to target URL: ${creds.targetUrl}`);
    await this.page.goto(creds.targetUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await this.dismissPopups();
    this.log("Navigated to target URL successfully.");
  }

  private startReloadLoop(): void {
    if (this.reloadTimer) clearInterval(this.reloadTimer);
    let reloadCount = 0;
    this._reloadLoopStartedAt = Date.now();

    this.reloadTimer = setInterval(async () => {
      if (!this.page || this._status !== "running") return;
      reloadCount++;
      this._reloadLoopStartedAt = Date.now();

      // Check if we are still on the target page — if not, navigate there instead of reloading
      let currentUrl = "";
      try { currentUrl = this.page.url() || ""; } catch { /**/ }
      const creds = await this.readCredentials().catch(() => null);
      const targetUrl = creds?.targetUrl || "";

      const onTarget =
        !!currentUrl &&
        !!targetUrl &&
        currentUrl.replace(/\/$/, "") === targetUrl.replace(/\/$/, "");

      if (!onTarget && targetUrl) {
        this.log(
          `Reload cycle ${reloadCount}: bot is on "${currentUrl}" — not the target page. Navigating to target...`,
          "warn"
        );
        try {
          await this.page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
          await this.dismissPopups();
          this.log(`Navigated to target URL (cycle ${reloadCount}).`);
        } catch (err: any) {
          this.log(`Failed to navigate to target (cycle ${reloadCount}): ${err.message}`, "warn");
        }
        return;
      }

      this.log(`Reloading page (cycle ${reloadCount})...`);
      try {
        await this.page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });

        // Wait for the SPA sidebar to render — poll until RENEW SERVER text appears
        this.log(`Page reloaded (cycle ${reloadCount}). Waiting for page to render...`);
        await this.page.waitForFunction(
          () => {
            const all = Array.from(document.querySelectorAll("a, button, div, span, li"));
            return all.some((el) => {
              const txt = (el.textContent || "").trim().toUpperCase();
              return txt === "RENEW SERVER" || (txt.includes("RENEW") && txt.includes("SERVER") && txt.length < 40);
            });
          },
          { timeout: 20000, polling: 800 }
        ).catch(() => {
          this.log("RENEW SERVER button not found after page load — page may still be loading.", "warn");
        });

        // Short buffer for Vue reactivity to fully settle after the element appears
        await new Promise((r) => setTimeout(r, 800));

        this.log(`Page ready (cycle ${reloadCount}). Checking server status...`);
        this._lastHealthyAt = Date.now();
        await this.checkAndRenewServer();
        await this.checkServerPaused();
      } catch (err: any) {
        if (this.isDetachedError(err)) {
          this.log(
            `Reload cycle ${reloadCount}: page frame detached — attempting recovery...`,
            "warn"
          );
          const recovered = await this.recoverPage();
          if (recovered && targetUrl) {
            this.log(`Recovery succeeded. Navigating to target URL...`);
            try {
              await this.page!.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
              await this.dismissPopups();
              this.log(`Back on target URL after recovery (cycle ${reloadCount}).`);
            } catch (navErr: any) {
              this.log(`Navigation after recovery failed: ${navErr.message}`, "warn");
            }
          } else if (!recovered) {
            this.log(
              "Recovery failed — no live page found. Bot may need a restart.",
              "error"
            );
          }
        } else {
          this.log(`Page reload failed (cycle ${reloadCount}): ${err.message}`, "warn");
        }
      }
    }, 60000);
  }

  private async checkAndRenewServer(): Promise<void> {
    if (!this.page) return;
    try {
      // Click the RENEW SERVER button in the left sidebar
      this.log("Clicking RENEW SERVER sidebar button...");
      const renewClicked = await this.page.evaluate(() => {
        // Walk every element looking for one whose direct text content matches
        const all = Array.from(document.querySelectorAll("a, button, div, span, li")) as HTMLElement[];
        const btn = all.find((el) => {
          const txt = el.textContent?.trim().toUpperCase() || "";
          // match "RENEW SERVER" exactly, or an element that contains it as its primary text
          return (
            txt === "RENEW SERVER" ||
            (txt.includes("RENEW") && txt.includes("SERVER") && txt.length < 40)
          );
        });
        if (btn) { btn.click(); return true; }
        return false;
      });

      if (!renewClicked) {
        this.log("RENEW SERVER button not found — skipping renewal check.", "warn");
        return;
      }

      // Wait for the modal to open (clock-time element appears)
      await this.page.waitForFunction(
        () => !!document.querySelector(".clock-time"),
        { timeout: 8000, polling: 500 }
      ).catch(() => null);

      await new Promise((r) => setTimeout(r, 500));

      // Read the clock time from the modal
      const clockTime = await this.page.evaluate(() => {
        const el = document.querySelector(".clock-time");
        return el ? el.textContent?.trim() ?? null : null;
      });

      if (!clockTime) {
        this.log("Modal opened but clock-time not readable — closing.", "warn");
        await this.page.keyboard.press("Escape").catch(() => {});
        return;
      }

      // Parse time — format is HH:MM (e.g. "00:52" = 52 min, "01:30" = 90 min)
      this._timeRemaining = clockTime;
      const parts = clockTime.split(":").map(Number);
      let totalMinutes = 0;
      if (parts.length === 2) {
        // HH:MM
        totalMinutes = parts[0] * 60 + parts[1];
      } else if (parts.length === 3) {
        // HH:MM:SS
        totalMinutes = parts[0] * 60 + parts[1];
      }
      this._timeRemainingMinutes = totalMinutes;

      this.log(`Free server time remaining: ${clockTime} (~${totalMinutes} min)`);

      // Close the modal
      await this.page.keyboard.press("Escape").catch(() => {});
      await new Promise((r) => setTimeout(r, 600));

      // If under 28 minutes, trigger the Cloudflare bypass + extend flow
      if (totalMinutes > 0 && totalMinutes < 28) {
        this.log(
          `⚠ Only ${totalMinutes} min left — triggering server renewal flow...`,
          "warn"
        );
        // Scroll to CF verification, wait 5s, click Extend
        await this.triggerRenewalFlow();
      }
    } catch (err: any) {
      this.log(`checkAndRenewServer error: ${err.message}`, "warn");
    }
  }

  private async triggerRenewalFlow(): Promise<void> {
    if (!this.page) return;
    try {
      // Scroll to Cloudflare verification widget
      await this.page.evaluate(() => {
        const cfEl =
          document.querySelector("iframe[src*='challenges.cloudflare']") ||
          document.querySelector(".cf-turnstile") ||
          document.querySelector("[class*='turnstile']") ||
          document.querySelector("[id*='turnstile']") ||
          document.querySelector(".expired-warning-banner");
        if (cfEl) {
          cfEl.scrollIntoView({ behavior: "smooth", block: "center" });
        } else {
          window.scrollBy(0, 500);
        }
      });

      this.log("Waiting 5s for Cloudflare auto-verification...");
      await new Promise((r) => setTimeout(r, 5000));

      // Click the Extend / Renew / Free button
      const clicked = await this.page.evaluate(() => {
        const allButtons = Array.from(
          document.querySelectorAll("button, a[role='button'], input[type='button'], input[type='submit'], a")
        ) as HTMLElement[];
        const extendBtn = allButtons.find((b) => {
          const txt = (b.textContent || (b as HTMLInputElement).value || "").toLowerCase().trim();
          return (
            txt.includes("extend") ||
            txt.includes("renew") ||
            txt.includes("continue") ||
            txt.includes("free") ||
            txt.includes("keep") ||
            txt.includes("resume") ||
            txt.includes("activate")
          );
        });
        if (extendBtn) {
          extendBtn.scrollIntoView({ behavior: "smooth", block: "center" });
          extendBtn.click();
          return extendBtn.textContent?.trim() || "button";
        }
        return null;
      });

      if (clicked) {
        this.log(`Renewal button clicked ("${clicked}"). Waiting for confirmation...`);
        await new Promise((r) => setTimeout(r, 3000));
        // Re-check the time after renewal
        await this.checkAndRenewServer();
      } else {
        this.log("No Extend/Renew button found during renewal flow.", "warn");
      }
    } catch (err: any) {
      this.log(`triggerRenewalFlow error: ${err.message}`, "warn");
    }
  }

  private async checkServerPaused(): Promise<void> {
    if (!this.page) return;
    try {
      const isPaused = await this.page.evaluate(() => {
        return !!document.querySelector(".expired-warning-banner");
      });

      if (!isPaused) {
        this.log("Server status: active — no pause banner detected.");
        return;
      }

      this.log("Server paused banner detected! Scrolling to Cloudflare verification box...", "warn");

      // Scroll to the Cloudflare verification widget (below the banner)
      await this.page.evaluate(() => {
        // Try to scroll to a cf-turnstile or iframe first, else scroll to banner
        const cfEl =
          document.querySelector("iframe[src*='challenges.cloudflare']") ||
          document.querySelector(".cf-turnstile") ||
          document.querySelector("[class*='turnstile']") ||
          document.querySelector("[id*='turnstile']") ||
          document.querySelector(".expired-warning-banner");
        if (cfEl) {
          cfEl.scrollIntoView({ behavior: "smooth", block: "center" });
        } else {
          window.scrollBy(0, 400);
        }
      });

      // Wait 5 seconds for Cloudflare to auto-verify
      this.log("Waiting 5s for Cloudflare auto-verification...");
      await new Promise((r) => setTimeout(r, 5000));

      // Click the Extend / Renew button below the verification box
      const clicked = await this.page.evaluate(() => {
        const allButtons = Array.from(
          document.querySelectorAll("button, a[role='button'], input[type='button'], input[type='submit']")
        ) as HTMLElement[];
        const extendBtn = allButtons.find((b) => {
          const txt = (b.textContent || (b as HTMLInputElement).value || "").toLowerCase().trim();
          return (
            txt.includes("extend") ||
            txt.includes("renew") ||
            txt.includes("continue") ||
            txt.includes("free") ||
            txt.includes("keep") ||
            txt.includes("resume") ||
            txt.includes("activate")
          );
        });
        if (extendBtn) {
          extendBtn.scrollIntoView({ behavior: "smooth", block: "center" });
          extendBtn.click();
          return extendBtn.textContent?.trim() || "button";
        }
        return null;
      });

      if (clicked) {
        this.log(`Extend button clicked ("${clicked}"). Server should resume shortly.`);
        // Wait for the banner to disappear
        await new Promise((r) => setTimeout(r, 3000));
        const stillPaused = await this.page.evaluate(
          () => !!document.querySelector(".expired-warning-banner")
        ).catch(() => false);
        if (stillPaused) {
          this.log("Banner still visible after click — may need manual intervention.", "warn");
        } else {
          this.log("Server paused banner gone — server resumed successfully.");
        }
      } else {
        this.log("Could not find Extend/Renew button — manual action may be needed.", "warn");
      }
    } catch (err: any) {
      this.log(`checkServerPaused error: ${err.message}`, "warn");
    }
  }

  private async cleanup() {
    if (this._healthWatchdog) {
      clearInterval(this._healthWatchdog);
      this._healthWatchdog = null;
    }
    if (this.screenshotTimer) {
      clearInterval(this.screenshotTimer);
      this.screenshotTimer = null;
    }
    if (this.afkTimer) {
      clearTimeout(this.afkTimer);
      this.afkTimer = null;
    }
    if (this.popupDismissTimer) {
      clearInterval(this.popupDismissTimer);
      this.popupDismissTimer = null;
    }
    if (this.reloadTimer) {
      clearInterval(this.reloadTimer);
      this.reloadTimer = null;
    }
    if (this.browser) {
      try {
        await this.browser.close();
      } catch {
        // ignore
      }
      this.browser = null;
      this.page = null;
    }
  }
}

export const botManager = new BotManager();
