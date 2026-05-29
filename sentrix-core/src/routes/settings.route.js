import express from "express";
import { requireRole } from "../middlewares/auth.middleware.js";
import * as settingsController from "../controllers/settings.controller.js";

const router = express.Router();

router.get("/telemetry", settingsController.getTelemetry);
router.patch("/telemetry", requireRole("network_admin"), settingsController.updateTelemetry);

router.get("/pruning", settingsController.getPruning);
router.patch("/pruning", requireRole("network_admin"), settingsController.updatePruning);
router.post("/pruning/trigger", requireRole("network_admin"), settingsController.triggerPruning);

export default router;
