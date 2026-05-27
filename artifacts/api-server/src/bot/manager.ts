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
  "--disable-background-networking",
  "--disable-default-apps",
  "--disable-sync",
  "--mute-audio",
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
  private latestScreenshot: string = "";
  private logs: LogEntry[] = [];
  private sseClients: Map<string, SSEClient> = new Map();
  private _status: "idle" | "starting" | "running" | "stopping" = "idle";

  get status() {
    return this._status;
  }

  get uptime(): number {
    if (!this.startTime) return 0;
    return Math.floor((Date.now() - this.startTime.getTime()) / 1000);
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
        targetUrl: "https://www.bytenut.com/free-gamepanel/d80e14ab",
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

      this.log("Chromium launched successfully.");
      this.log(`Navigating to login URL: ${creds.loginUrl}`);

      await this.page.goto(creds.loginUrl, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      this.log("Page loaded. Filling login credentials...");

      await this.page.evaluate(
        (username: string, password: string) => {
          const inputs = Array.from(document.querySelectorAll("input"));
          const usernameInput = inputs.find(
            (i) =>
              i.type === "text" ||
              i.type === "email" ||
              i.name?.toLowerCase().includes("user") ||
              i.name?.toLowerCase().includes("email") ||
              i.id?.toLowerCase().includes("user") ||
              i.id?.toLowerCase().includes("email")
          );
          const passwordInput = inputs.find(
            (i) =>
              i.type === "password" ||
              i.name?.toLowerCase().includes("pass") ||
              i.id?.toLowerCase().includes("pass")
          );
          if (usernameInput) {
            usernameInput.value = username;
            usernameInput.dispatchEvent(new Event("input", { bubbles: true }));
            usernameInput.dispatchEvent(new Event("change", { bubbles: true }));
          }
          if (passwordInput) {
            passwordInput.value = password;
            passwordInput.dispatchEvent(new Event("input", { bubbles: true }));
            passwordInput.dispatchEvent(new Event("change", { bubbles: true }));
          }
        },
        creds.username,
        creds.password
      );

      this.log("Credentials filled. Submitting login form...");

      await this.page.evaluate(() => {
        const buttons = Array.from(
          document.querySelectorAll("button, input[type=submit], [type=submit]")
        );
        const submitBtn = buttons.find(
          (b: any) =>
            b.textContent?.toLowerCase().includes("login") ||
            b.textContent?.toLowerCase().includes("sign in") ||
            b.textContent?.toLowerCase().includes("log in") ||
            b.type === "submit"
        ) as HTMLElement | undefined;
        if (submitBtn) submitBtn.click();
        else {
          const form = document.querySelector("form");
          if (form) form.submit();
        }
      });

      // Wait for either a navigation or a short timeout (SPA sites may not fire navigation events)
      await Promise.race([
        this.page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 8000 }),
        new Promise((r) => setTimeout(r, 3000)),
      ]).catch(() => {});

      // Give SPA client-side routing time to settle
      await new Promise((r) => setTimeout(r, 2000));

      const urlAfterSubmit = this.page.url();
      this.log(`Login submitted. Current URL: ${urlAfterSubmit}`);

      const isStillOnLogin =
        urlAfterSubmit.toLowerCase().includes("/auth/login") ||
        urlAfterSubmit.toLowerCase().includes("/login");

      if (isStillOnLogin) {
        // Check if login form still has error messages visible
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

      this.startScreenshotLoop(config.screenshotInterval);
      this.startAfkLoop();
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
      } catch {
        // ignore screenshot errors
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
        this.log("Anti-AFK action executed (mouse moved, page scrolled).");
      } catch {
        this.log("Anti-AFK action failed — page may have changed.", "warn");
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

  private async cleanup() {
    if (this.screenshotTimer) {
      clearInterval(this.screenshotTimer);
      this.screenshotTimer = null;
    }
    if (this.afkTimer) {
      clearTimeout(this.afkTimer);
      this.afkTimer = null;
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
