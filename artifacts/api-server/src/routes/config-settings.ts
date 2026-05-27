import { Router, type IRouter, type Request, type Response } from "express";
import { botManager } from "../bot/manager.js";

const router: IRouter = Router();

router.get("/config", async (_req: Request, res: Response): Promise<void> => {
  const config = await botManager.readConfig();
  res.json(config);
});

router.post("/config", async (req: Request, res: Response): Promise<void> => {
  const { screenshotInterval, theme } = req.body as {
    screenshotInterval?: number;
    theme?: string;
  };

  const existing = await botManager.readConfig();
  const updated = {
    screenshotInterval:
      typeof screenshotInterval === "number"
        ? Math.max(100, screenshotInterval)
        : existing.screenshotInterval,
    theme: typeof theme === "string" ? theme : existing.theme,
  };

  await botManager.writeConfig(updated);

  if (typeof screenshotInterval === "number") {
    await botManager.updateScreenshotInterval(updated.screenshotInterval);
  }

  res.json({ ok: true, config: updated });
});

router.get("/credentials", async (_req: Request, res: Response): Promise<void> => {
  const creds = await botManager.readCredentials();
  res.json({
    loginUrl: creds.loginUrl,
    targetUrl: creds.targetUrl,
    username: creds.username,
    password: creds.password ? "••••••••" : "",
  });
});

router.post("/credentials", async (req: Request, res: Response): Promise<void> => {
  const { loginUrl, targetUrl, username, password } = req.body as {
    loginUrl?: string;
    targetUrl?: string;
    username?: string;
    password?: string;
  };

  const existing = await botManager.readCredentials();
  const updated = {
    loginUrl: typeof loginUrl === "string" ? loginUrl.trim() : existing.loginUrl,
    targetUrl: typeof targetUrl === "string" ? targetUrl.trim() : existing.targetUrl,
    username: typeof username === "string" ? username.trim() : existing.username,
    password:
      typeof password === "string" && password !== "••••••••"
        ? password
        : existing.password,
  };

  await botManager.writeCredentials(updated);
  res.json({ ok: true });
});

export default router;
