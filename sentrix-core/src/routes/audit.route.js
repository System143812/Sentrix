import express from "express";
import { requireRole } from "../middlewares/auth.middleware.js";
import * as auditController from "../controllers/audit.controller.js";

const router = express.Router();

router.get("/", requireRole("network_admin"), auditController.listAuditLogs);
router.post("/:id/authorize", requireRole("network_admin"), auditController.authorizeAuditLogSubject);

router.get("/authority", requireRole("network_admin"), auditController.listAuthorityRecords);
router.post("/authority/:id/revoke", requireRole("network_admin"), auditController.revokeAuthority);
router.post("/whitelist", requireRole("network_admin"), auditController.addToWhitelist);

export default router;
