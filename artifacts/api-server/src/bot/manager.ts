import { createRequire } from "module";
import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { logger } from "../lib/logger.js";

const _require = createRequire(import.meta.url);

const DATA_DIR = path.resolve(process.cwd(), "data");
const CREDENTIALS_FILE = path.join(DATA_DIR, "credentials.json");
const CONFIG_FILE = path.join(DATA_DIR, "config.json");

export interface Credentials {
  loginUrl: string;
  targetUrl: string;
  username: string;
  password: string;
}

export interface Config {
  screenshotInterval: number;
  theme: string;
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

class BotManager {
  private browser: any = null;
  private page: any = null;
  private startTime: Date | null = null;
  private screenshotTimer: ReturnType<typeof setInterval> | null = null;
  private afkTimer: ReturnType<typeof setInterval> | null = null;
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
    if (!existsSync(CONFIG_FILE)) {
      return { screenshotInterval: 1000, theme: "cyberpunk" };
    }
    const raw = await readFile(CONFIG_FILE, "utf8");
    return JSON.parse(raw) as Config;
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
        throw new Error("Username and password are required. Please configure credentials first.");
      }

      this.log("Launching Chromium via puppeteer-real-browser...");

      let connectFn: any;
      try {
        const mod = _require("puppeteer-real-browser");
        connectFn = mod.connect;
      } catch (err: any) {
        this._status = "idle";
        throw new Error(`Failed to load puppeteer-real-browser: ${err.message}`);
      }

      const chromiumPath =
        process.env.CHROMIUM_PATH ||
        process.env.PUPPETEER_EXECUTABLE_PATH ||
        "/run/current-system/sw/bin/chromium" ||
        "/usr/bin/chromium-browser" ||
        "/usr/bin/chromium";

      const result = await connectFn({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--no-first-run",
          "--no-zygote",
          "--single-process",
          "--disable-extensions",
        ],
        customConfig: {
          executablePath: chromiumPath,
        },
        turnstile: false,
        connectOption: {},
        disableXvfb: true,
        ignoreAllFlags: false,
      });

      this.browser = result.browser;
      this.page = result.page;

      this.log("Chromium launched successfully.");
      this.log(`Navigating to login URL: ${creds.loginUrl}`);

      await this.page.goto(creds.loginUrl, {
        waitUntil: "networkidle2",
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
        const buttons = Array.from(document.querySelectorAll("button, input[type=submit], [type=submit]"));
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

      await this.page.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 }).catch(() => {
        this.log("Navigation timeout after login — continuing anyway.", "warn");
      });

      const currentUrl = this.page.url();
      this.log(`Login submitted. Current URL: ${currentUrl}`);

      if (
        currentUrl.toLowerCase().includes("login") ||
        currentUrl.toLowerCase().includes("auth")
      ) {
        this.log("Warning: Still on login page. Credentials may be incorrect.", "warn");
      } else {
        this.log("Logged in successfully.");
      }

      this.log(`Navigating to target URL: ${creds.targetUrl}`);
      await this.page.goto(creds.targetUrl, {
        waitUntil: "networkidle2",
        timeout: 30000,
      });
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

  private startScreenshotLoop(intervalMs: number) {
    if (this.screenshotTimer) clearInterval(this.screenshotTimer);
    const captureScreenshot = async () => {
      if (!this.page || this._status !== "running") return;
      try {
        const buffer = await this.page.screenshot({ type: "jpeg", quality: 70 });
        this.latestScreenshot = buffer.toString("base64");
      } catch {
        // ignore screenshot errors
      }
    };
    captureScreenshot();
    this.screenshotTimer = setInterval(captureScreenshot, Math.max(100, intervalMs));
  }

  private startAfkLoop() {
    if (this.afkTimer) clearInterval(this.afkTimer);
    const randomInterval = () => Math.floor(Math.random() * 120000) + 60000;

    const doAfkAction = async () => {
      if (!this.page || this._status !== "running") return;
      try {
        const viewport = this.page.viewport() || { width: 1280, height: 720 };
        const x = Math.floor(Math.random() * viewport.width);
        const y = Math.floor(Math.random() * viewport.height);
        await this.page.mouse.move(x, y);
        await this.page.evaluate(() => window.scrollBy(0, Math.random() * 100 - 50));
        this.log(`Anti-AFK action executed (mouse moved, page scrolled).`);
      } catch {
        this.log("Anti-AFK action failed — page may have changed.", "warn");
      }
      if (this._status === "running") {
        this.afkTimer = setTimeout(doAfkAction, randomInterval()) as any;
      }
    };

    this.afkTimer = setTimeout(doAfkAction, randomInterval()) as any;
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
      clearInterval(this.afkTimer as any);
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
