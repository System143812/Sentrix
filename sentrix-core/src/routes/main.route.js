import clientRouter from "./client.route.js";
import discoveryRouter from "./discovery.route.js";
import analyticsRouter from "./analytics.route.js";
import authRouter from "./auth.route.js";
import userRouter from "./user.route.js";
import groupRouter from "./group.route.js";
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
router.use("/api/discovery", authenticate, discoveryRouter);
router.use("/api/users", userRouter);
router.use("/api/groups", groupRouter);

export default router;
