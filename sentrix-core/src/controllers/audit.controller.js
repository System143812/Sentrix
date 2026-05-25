import * as auditService from "../services/audit.service.js";

export async function listAuditLogs(req, res, next) {
  try {
    const logs = await auditService.getAuditLogs(req.query);
    res.json({ success: true, data: logs });
  } catch (error) {
    next(error);
  }
}
