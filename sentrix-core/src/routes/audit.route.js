import express from "express";
import { requireRole } from "../middlewares/auth.middleware.js";
import * as auditController from "../controllers/audit.controller.js";

const router = express.Router();

router.get("/", requireRole("network_admin"), auditController.listAuditLogs);

export default router;
