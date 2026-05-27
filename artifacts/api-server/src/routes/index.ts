import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import botRouter from "./bot.js";
import configRouter from "./config-settings.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(botRouter);
router.use(configRouter);

export default router;
