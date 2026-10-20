import clientRouter from "../modules/clients/clients.route.js";
import discoveryRouter from "../modules/discovery/discovery.route.js";
import analyticsRouter from "../modules/analytics/analytics.route.js";
import authRouter from "../modules/auth/auth.route.js";
import userRouter from "../modules/users/users.route.js";
import groupRouter from "../modules/groups/groups.route.js";
import auditRouter from "../modules/audit/audit.route.js";
import settingsRouter from "../modules/settings/settings.route.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import express from "express";

const router = express.Router();

function sendHealth(req, res) {
  res.json({
    success: true,
    message: "Sentrix core is healthy.",
  });
}

router.get("/health", sendHealth);
router.get("/api/health", sendHealth);

router.use("/api/auth", authRouter);
router.use("/api/analytics", authenticate, analyticsRouter);
router.use("/api/clients", authenticate, clientRouter);
router.use("/api/discovery", discoveryRouter);
router.use("/api/audit", authenticate, auditRouter);
router.use("/api/settings", authenticate, settingsRouter);
router.use("/api/users", userRouter);
router.use("/api/groups", groupRouter);

export default router;
