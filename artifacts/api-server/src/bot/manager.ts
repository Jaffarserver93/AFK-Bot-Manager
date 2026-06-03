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
  private _loginWatchdog: ReturnType<typeof setInterval> | null = null;
  private _reloginInProgress: boolean = false;

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
      const loginOk = await this.performLogin(creds);
      if (!loginOk) {
        throw new Error("Login failed — could not authenticate. Check credentials.");
      }

      this.log("Target URL loaded. Bot is now active.");

      this._status = "running";
      this.startTime = new Date();

      this._lastHealthyAt = Date.now();
      this.startScreenshotLoop(config.screenshotInterval);
      this.startAfkLoop();
      this.startPopupDismissLoop();
      this.startReloadLoop();
      this.startHealthWatchdog();
      this.startLoginPageWatchdog();
    } catch (err: any) {
      this._status = "idle";
      this.log(`Bot failed to start: ${err.message}`, "error");
      await this.cleanup();
      throw err;
    }
  }

  private isOnLoginPage(url: string): boolean {
    const u = url.toLowerCase();
    return u.includes("/auth/login") || u.includes("/login");
  }

  private async performLogin(creds: Credentials): Promise<boolean> {
    if (!this.page) return false;

    this.log("Authenticating via username/password...");

    // Navigate to target first to see if we're already authenticated
    this.log(`Navigating to target URL: ${creds.targetUrl}`);
    await this.page.goto(creds.targetUrl, {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });

    await this.dismissPopups();
    await new Promise((r) => setTimeout(r, 2000));
    await this.dismissPopups();

    const firstUrl = this.page.url();
    if (!this.isOnLoginPage(firstUrl)) {
      this.log(`Already authenticated. URL: ${firstUrl}`);
      return true;
    }

    // We're on the login page — navigate to loginUrl and fill credentials
    this.log(`On login page — navigating to login URL: ${creds.loginUrl}`);
    await this.page.goto(creds.loginUrl, {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });

    await this.dismissPopups();
    await new Promise((r) => setTimeout(r, 1500));

    try {
      // Find and fill username field (try common selectors)
      const usernameSelectors = [
        'input[name="username"]',
        'input[name="email"]',
        'input[type="email"]',
        'input[type="text"]',
        'input[id*="user"]',
        'input[id*="email"]',
        'input[placeholder*="email" i]',
        'input[placeholder*="username" i]',
      ];
      let userFilled = false;
      for (const sel of usernameSelectors) {
        try {
          await this.page.waitForSelector(sel, { timeout: 3000 });
          await this.page.click(sel, { clickCount: 3 });
          await this.page.type(sel, creds.username, { delay: 50 });
          userFilled = true;
          this.log(`Username filled using selector: ${sel}`);
          break;
        } catch { continue; }
      }
      if (!userFilled) {
        this.log("Could not find username input field.", "warn");
      }

      // Find and fill password field
      const passwordSelectors = [
        'input[name="password"]',
        'input[type="password"]',
        'input[id*="pass"]',
        'input[placeholder*="password" i]',
      ];
      let passFilled = false;
      for (const sel of passwordSelectors) {
        try {
          await this.page.waitForSelector(sel, { timeout: 3000 });
          await this.page.click(sel, { clickCount: 3 });
          await this.page.type(sel, creds.password, { delay: 50 });
          passFilled = true;
          this.log(`Password filled using selector: ${sel}`);
          break;
        } catch { continue; }
      }
      if (!passFilled) {
        this.log("Could not find password input field.", "warn");
      }

      // Submit the form
      const submitSelectors = [
        'button[type="submit"]',
        'input[type="submit"]',
        'button:contains("Login")',
        'button:contains("Sign in")',
        'button:contains("Log in")',
      ];
      let submitted = false;
      for (const sel of submitSelectors) {
        try {
          await this.page.click(sel);
          submitted = true;
          this.log(`Form submitted using selector: ${sel}`);
          break;
        } catch { continue; }
      }
      if (!submitted) {
        // Fallback: press Enter in the password field
        try {
          await this.page.keyboard.press("Enter");
          this.log("Form submitted via Enter key.");
        } catch { /**/ }
      }
    } catch (err: any) {
      this.log(`Login form interaction failed: ${err.message}`, "warn");
    }

    // Wait for navigation after submit
    await new Promise((r) => setTimeout(r, 3000));
    await this.dismissPopups();

    // Now navigate to target
    await this.page.goto(creds.targetUrl, {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    }).catch(() => {});

    await this.dismissPopups();

    const finalUrl = this.page.url();
    if (this.isOnLoginPage(finalUrl)) {
      this.log(
        `Still on login page after authentication attempt — credentials may be invalid. URL: ${finalUrl}`,
        "error"
      );
      return false;
    }

    this.log(`Login successful. URL: ${finalUrl}`);
    return true;
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

  /**
   * Checks every 15 seconds whether the bot has been redirected to the login
   * page (e.g. session expired). If so, immediately re-authenticates and
   * navigates back to the target URL — without waiting for the slower reload cycle.
   */
  private startLoginPageWatchdog(): void {
    if (this._loginWatchdog) clearInterval(this._loginWatchdog);

    this._loginWatchdog = setInterval(async () => {
      if (this._status !== "running" || this._reloginInProgress) return;
      if (!this.page) return;

      let currentUrl = "";
      try { currentUrl = this.page.url() || ""; } catch { return; }

      if (!this.isOnLoginPage(currentUrl)) return;

      // We're on the login page while the bot is supposed to be running
      this._reloginInProgress = true;
      this.log(
        `⚠ Login page detected while bot is running (URL: ${currentUrl}) — re-authenticating...`,
        "warn"
      );

      try {
        const creds = await this.readCredentials();
        const loginOk = await this.performLogin(creds);
        if (loginOk) {
          this.log("Re-authentication successful — bot is back on the target page.");
          this._lastHealthyAt = Date.now();
        } else {
          this.log("Re-authentication failed — will retry on next check.", "error");
        }
      } catch (err: any) {
        this.log(`Re-authentication error: ${err.message}`, "error");
      } finally {
        this._reloginInProgress = false;
      }
    }, 15000);
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
        // ── Detected off-target ───────────────────────────────────────────────
        if (this.isOnLoginPage(currentUrl)) {
          // Session expired / was never set — re-run the full login flow
          this.log(
            `Reload cycle ${reloadCount}: bot is on the login page — session may have expired. Re-authenticating...`,
            "warn"
          );
          try {
            const loginOk = await this.performLogin(creds!);
            if (loginOk) {
              this.log(`Re-authentication successful (cycle ${reloadCount}).`);
            } else {
              this.log(
                `Re-authentication failed (cycle ${reloadCount}) — will retry on next cycle.`,
                "error"
              );
            }
          } catch (err: any) {
            this.log(`Re-authentication error (cycle ${reloadCount}): ${err.message}`, "error");
          }
        } else {
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
        const extendedByRenew = await this.checkAndRenewServer();
        // Only run checkServerPaused if checkAndRenewServer did NOT already click Extend
        // (prevents double-clicking the same button)
        if (!extendedByRenew) {
          await this.checkServerPaused();
        }
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

  private async checkAndRenewServer(): Promise<boolean> {
    if (!this.page) return false;
    try {
      // Click the RENEW SERVER button in the left sidebar
      this.log("Clicking RENEW SERVER sidebar button...");
      const renewClicked = await this.page.evaluate(() => {
        const all = Array.from(document.querySelectorAll("a, button, div, span, li")) as HTMLElement[];
        const btn = all.find((el) => {
          const txt = el.textContent?.trim().toUpperCase() || "";
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
        return false;
      }

      // Wait for the modal to open AND for the clock to show a non-zero value.
      // The modal initially renders "00:00" while it fetches data from the server —
      // we must poll until the value stabilises to something meaningful (non-zero),
      // or until 12 seconds have elapsed (then we take whatever is shown).
      await this.page.waitForFunction(
        () => {
          const el = document.querySelector(".clock-time");
          if (!el) return false;
          const txt = (el.textContent || "").trim();
          // Accept any value that is NOT blank and NOT "00:00"
          if (!txt || txt === "00:00") return false;
          return true;
        },
        { timeout: 12000, polling: 400 }
      ).catch(() => null); // timeout is OK — we'll read whatever is there

      // Extra buffer for Vue reactivity to settle after the value updates
      await new Promise((r) => setTimeout(r, 800));

      // Read the clock time from the modal
      const clockTime = await this.page.evaluate(() => {
        const el = document.querySelector(".clock-time");
        return el ? el.textContent?.trim() ?? null : null;
      });

      if (!clockTime) {
        this.log("Modal opened but clock-time not readable — closing.", "warn");
        await this.page.keyboard.press("Escape").catch(() => {});
        return false;
      }

      // Parse time — format is HH:MM (e.g. "00:52" = 52 min, "01:30" = 90 min)
      this._timeRemaining = clockTime;
      const parts = clockTime.split(":").map(Number);
      let totalMinutes = 0;
      if (parts.length === 2) {
        totalMinutes = parts[0] * 60 + parts[1];
      } else if (parts.length === 3) {
        totalMinutes = parts[0] * 60 + parts[1];
      }
      this._timeRemainingMinutes = totalMinutes;

      this.log(`Free server time remaining: ${clockTime} (~${totalMinutes} min)`);

      // If under 28 minutes (INCLUDING 0 = expired), click the Extend button
      // directly from the open modal — do NOT close it first.
      if (totalMinutes < 28) {
        this.log(`⚠ Only ${totalMinutes} min left — preparing to extend...`, "warn");
        const extended = await this.clickExtendButton();
        if (extended === "cooldown") {
          this.log("Extend button is on cooldown — closing modal.");
          await this.page.keyboard.press("Escape").catch(() => {});
          return false;
        } else if (extended === "clicked") {
          return true; // signal that we handled the extend — skip checkServerPaused
        } else {
          this.log("Extend button not found in modal — closing modal.", "warn");
          await this.page.keyboard.press("Escape").catch(() => {});
          return false;
        }
      } else {
        // Plenty of time remaining — just close the modal
        this.log(`Server time OK (${totalMinutes} min). Closing modal.`);
        await this.page.keyboard.press("Escape").catch(() => {});
        await new Promise((r) => setTimeout(r, 600));
        return false;
      }
    } catch (err: any) {
      this.log(`checkAndRenewServer error: ${err.message}`, "warn");
      return false;
    }
  }

  /**
   * Unified extend-button handler used by all renewal paths.
   *
   * Strategy:
   *  1. Inspect the Turnstile widget state inside the modal/page.
   *     - If the script FAILED to load → skip waiting (it will never verify).
   *     - If the iframe IS present and loading → wait up to 6 s for auto-verify.
   *     - If no widget at all → click immediately.
   *  2. Find the "Extend Server Time +60 min" button.
   *     - If it is disabled/on-cooldown → return "cooldown".
   *     - Otherwise scroll it into view.
   *  3. Fire BOTH a real Puppeteer mouse-click (which passes Cloudflare's
   *     event-fingerprint checks) AND a JS .click() as fallback.
   *  4. Wait for a success signal (modal closes or clock updates) and log result.
   *
   * Returns: "clicked" | "cooldown" | "not_found"
   */
  private async clickExtendButton(): Promise<"clicked" | "cooldown" | "not_found"> {
    if (!this.page) return "not_found";

    // ── 1. Detect Turnstile widget state ──────────────────────────────────────
    const turnstileInfo = await this.page.evaluate(() => {
      const allText = document.body?.innerText || "";
      const failedToLoad =
        allText.includes("Failed to load Turnstile") ||
        allText.includes("failed to load turnstile");

      const iframe =
        document.querySelector("iframe[src*='challenges.cloudflare']") ||
        document.querySelector(".cf-turnstile iframe");

      // A verified Turnstile iframe has a non-zero offsetHeight and its src loaded
      const iframePresent = !!iframe;

      return { failedToLoad, iframePresent };
    });

    if (turnstileInfo.failedToLoad) {
      this.log(
        "Turnstile script failed to load in this environment — skipping CF wait, clicking extend directly.",
        "warn"
      );
    } else if (turnstileInfo.iframePresent) {
      // Scroll to the Turnstile widget and give it time to auto-verify
      await this.page.evaluate(() => {
        const cfEl =
          document.querySelector("iframe[src*='challenges.cloudflare']") ||
          document.querySelector(".cf-turnstile") ||
          document.querySelector("[class*='turnstile']") ||
          document.querySelector("[id*='turnstile']");
        if (cfEl) cfEl.scrollIntoView({ behavior: "smooth", block: "center" });
        else window.scrollBy(0, 300);
      });
      this.log("Turnstile widget detected — waiting up to 6 s for auto-verification...");
      await new Promise((r) => setTimeout(r, 6000));
    } else {
      this.log("No Turnstile widget found — clicking extend button directly.");
      await this.page.evaluate(() => window.scrollBy(0, 300));
      await new Promise((r) => setTimeout(r, 500));
    }

    // ── 2. Locate the extend button ───────────────────────────────────────────
    const btnInfo = await this.page.evaluate(() => {
      const allButtons = Array.from(
        document.querySelectorAll("button, a")
      ) as HTMLElement[];

      const extendBtn =
        allButtons.find((b) => {
          const txt = (b.textContent || "").toLowerCase().trim();
          return txt.includes("extend") && (txt.includes("60") || txt.includes("server time"));
        }) ||
        allButtons.find((b) => {
          const txt = (b.textContent || "").toLowerCase().trim();
          return txt.includes("extend") && !txt.includes("renew server");
        });

      if (!extendBtn) return null;

      extendBtn.scrollIntoView({ behavior: "smooth", block: "center" });

      const rect = extendBtn.getBoundingClientRect();
      const isDisabled =
        (extendBtn as HTMLButtonElement).disabled ||
        extendBtn.hasAttribute("disabled") ||
        extendBtn.classList.toString().toLowerCase().includes("cooldown") ||
        (extendBtn.textContent || "").toLowerCase().includes("cooldown");

      return {
        text: extendBtn.textContent?.trim() || "",
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        isDisabled,
      };
    });

    if (!btnInfo) {
      return "not_found";
    }

    if (btnInfo.isDisabled) {
      this.log(`Extend button found but disabled/on-cooldown: "${btnInfo.text}"`);
      return "cooldown";
    }

    // ── 3. Fire real mouse click + JS click ───────────────────────────────────
    // Extra buffer so scrollIntoView animation settles
    await new Promise((r) => setTimeout(r, 600));

    this.log(`Clicking extend button via mouse: "${btnInfo.text}"...`);
    try {
      // Real mouse event — passes Cloudflare's pointer-event fingerprint check
      await this.page.mouse.click(btnInfo.x, btnInfo.y);
    } catch { /* ignore — may fail if element moved */ }

    // JS click as belt-and-suspenders backup
    await this.page.evaluate(() => {
      const allButtons = Array.from(
        document.querySelectorAll("button, a")
      ) as HTMLElement[];
      const extendBtn =
        allButtons.find((b) => {
          const txt = (b.textContent || "").toLowerCase().trim();
          return txt.includes("extend") && (txt.includes("60") || txt.includes("server time"));
        }) ||
        allButtons.find((b) => {
          const txt = (b.textContent || "").toLowerCase().trim();
          return txt.includes("extend") && !txt.includes("renew server");
        });
      if (extendBtn) extendBtn.click();
    }).catch(() => {});

    // ── 4. Wait and verify success ────────────────────────────────────────────
    await new Promise((r) => setTimeout(r, 4000));

    const result = await this.page.evaluate(() => {
      const body = document.body?.innerText || "";
      const hasSuccess =
        body.includes("extended") ||
        body.includes("Extended") ||
        body.includes("+60") ||
        body.includes("success") ||
        body.includes("Success");
      const modalGone = !document.querySelector(".clock-time");
      const hasExtendError =
        (body.toLowerCase().includes("error") || body.toLowerCase().includes("failed")) &&
        body.toLowerCase().includes("extend");
      return { hasSuccess, modalGone, hasExtendError };
    }).catch(() => ({ hasSuccess: false, modalGone: false, hasExtendError: false }));

    if (result.hasExtendError) {
      this.log("⚠ Extend may have failed — error text detected after click.", "warn");
    } else if (result.hasSuccess || result.modalGone) {
      this.log("✓ Server time extension confirmed.");
    } else {
      this.log("Extend button clicked — awaiting server confirmation.");
    }

    await this.page.keyboard.press("Escape").catch(() => {});
    return "clicked";
  }

  private async triggerRenewalFlow(): Promise<void> {
    if (!this.page) return;
    try {
      const result = await this.clickExtendButton();
      if (result === "clicked") {
        // NOTE: do NOT call checkAndRenewServer() here — that causes a recursive loop
      } else if (result === "cooldown") {
        this.log("Renewal flow: extend button on cooldown.");
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

      this.log("Server paused banner detected — attempting to extend...", "warn");

      const result = await this.clickExtendButton();
      if (result === "clicked") {
        // Check if banner cleared
        await new Promise((r) => setTimeout(r, 2000));
        const stillPaused = await this.page.evaluate(
          () => !!document.querySelector(".expired-warning-banner")
        ).catch(() => false);
        if (stillPaused) {
          this.log("Pause banner still visible after extend — may need manual intervention.", "warn");
        } else {
          this.log("Server paused banner gone — server resumed successfully.");
        }
      } else if (result === "cooldown") {
        this.log("Cannot extend — button on cooldown. Server remains paused.", "warn");
      } else {
        this.log("Could not find Extend/Renew button — manual action may be needed.", "warn");
      }
    } catch (err: any) {
      this.log(`checkServerPaused error: ${err.message}`, "warn");
    }
  }

  private async cleanup() {
    if (this._loginWatchdog) {
      clearInterval(this._loginWatchdog);
      this._loginWatchdog = null;
    }
    this._reloginInProgress = false;
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
