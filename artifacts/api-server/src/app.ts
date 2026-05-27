import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { existsSync } from "fs";
import router from "./routes/index.js";
import { logger } from "./lib/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname_mod = dirname(__filename);

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

const STATIC_DIR =
  process.env.STATIC_DIR ||
  join(__dirname_mod, "../../../frontend/public");

if (existsSync(STATIC_DIR)) {
  app.get("/", (_req, res) => res.redirect("/dashboard.html"));
  app.use(express.static(STATIC_DIR));
  logger.info({ STATIC_DIR }, "Serving static frontend");
}

export default app;
