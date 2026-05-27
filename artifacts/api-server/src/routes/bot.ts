import { Router, type IRouter, type Request, type Response } from "express";
import { botManager } from "../bot/manager.js";

const router: IRouter = Router();

router.get("/bot/status", async (_req: Request, res: Response): Promise<void> => {
  const uptime = botManager.uptime;
  const h = Math.floor(uptime / 3600);
  const m = Math.floor((uptime % 3600) / 60);
  const s = uptime % 60;
  const uptimeStr = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;

  res.json({
    status: botManager.status,
    uptime: uptimeStr,
    uptimeSeconds: uptime,
    timeRemaining: botManager.timeRemaining,
    timeRemainingMinutes: botManager.timeRemainingMinutes,
    logs: botManager.getLogs().slice(-50),
  });
});

router.post("/bot/start", async (_req: Request, res: Response): Promise<void> => {
  try {
    botManager.start().catch((err: Error) => {
      botManager.log(`Bot error: ${err.message}`, "error");
    });
    res.json({ ok: true, message: "Bot starting..." });
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post("/bot/stop", async (_req: Request, res: Response): Promise<void> => {
  await botManager.stop();
  res.json({ ok: true, message: "Bot stopped." });
});

router.post("/bot/restart", async (_req: Request, res: Response): Promise<void> => {
  try {
    botManager.restart().catch((err: Error) => {
      botManager.log(`Restart error: ${err.message}`, "error");
    });
    res.json({ ok: true, message: "Bot restarting..." });
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.get("/bot/screenshot", (_req: Request, res: Response): void => {
  const b64 = botManager.getLatestScreenshot();
  if (!b64) {
    res.status(404).json({ error: "No screenshot available" });
    return;
  }
  const buf = Buffer.from(b64, "base64");
  res.set("Content-Type", "image/jpeg");
  res.set("Cache-Control", "no-cache, no-store, must-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  res.send(buf);
});

router.get("/bot/logs/stream", (req: Request, res: Response): void => {
  const clientId = `${Date.now()}-${Math.random()}`;
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });
  res.flushHeaders();

  const recentLogs = botManager.getLogs().slice(-50);
  for (const entry of recentLogs) {
    res.write(`data: ${JSON.stringify(entry)}\n\n`);
  }

  const heartbeat = setInterval(() => {
    res.write(`: heartbeat\n\n`);
  }, 20000);

  botManager.addSSEClient(clientId, res);

  req.on("close", () => {
    clearInterval(heartbeat);
  });
});

export default router;
