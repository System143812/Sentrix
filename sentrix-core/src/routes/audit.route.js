import express from "express";
import { requireRole } from "../middlewares/auth.middleware.js";
import * as auditController from "../controllers/audit.controller.js";

const router = express.Router();

router.get("/", requireRole("network_admin"), auditController.listAuditLogs);
router.post("/:id/block", requireRole("network_admin"), auditController.blockAuditLogSubject);

export default router;
