import express from "express";
import { requireRole } from "../middlewares/auth.middleware.js";
import * as settingsController from "../controllers/settings.controller.js";

const router = express.Router();

router.get("/telemetry", settingsController.getTelemetry);
router.patch("/telemetry", requireRole("network_admin"), settingsController.updateTelemetry);

export default router;
