import * as auditService from "../services/audit.service.js";

export async function listAuditLogs(req, res, next) {
  try {
    const logs = await auditService.getAuditLogs(req.query);
    res.json({ success: true, data: logs });
  } catch (error) {
    next(error);
  }
}

export async function blockAuditLogSubject(req, res, next) {
  try {
    const result = await auditService.blockLogSubject(req.params.id, {
      reason: req.body?.reason || "",
      blockedBy: req.user?.id || null,
    });

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}
