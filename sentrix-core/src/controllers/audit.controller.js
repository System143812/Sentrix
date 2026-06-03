import * as auditService from "../services/audit.service.js";

export async function listAuditLogs(req, res, next) {
  try {
    const logs = await auditService.getAuditLogs(req.query);
    res.json({ success: true, data: logs });
  } catch (error) {
    next(error);
  }
}

export async function authorizeAuditLogSubject(req, res, next) {
  try {
    const result = await auditService.authorizeLogSubject(req.params.id, {
      reason: req.body?.reason || "",
      authorizedBy: req.user?.id || null,
    });

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function blockAuditLogSubject(req, res, next) {
  try {
    const result = await auditService.blockLogSubject(req.params.id, {
      reason: req.body?.reason || "Manual security block",
      blockedBy: req.user?.id || null,
    });

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function listAuthorityRecords(req, res, next) {
  try {
    const { category = "whitelist" } = req.query;
    const records = await auditService.getBlockedSubjects(category);
    res.json({ success: true, data: records });
  } catch (error) {
    next(error);
  }
}

export async function addToWhitelist(req, res, next) {
  try {
    const { label, type, identifier } = req.body;
    if (!label || !type || !identifier) {
      return res.status(400).json({ success: false, message: "Missing required fields." });
    }

    await auditService.authorizeAuditDevice(req, { label, type, identifier });
    res.json({ success: true, message: "Device added to whitelist." });
  } catch (error) {
    next(error);
  }
}

export async function revokeAuthority(req, res, next) {
  try {
    const { reason = "" } = req.body;
    const result = await auditService.revokeAuthorityRecord(req.params.id, {
      revokedBy: req.user?.id || null,
      reason,
    });

    const isWhitelist = result.category === "whitelist";

    await auditService.logAuditEvent({
      req,
      action: isWhitelist ? "REVOKE_TRUST" : "RESTORE_ACCESS",
      targetType: result.subject_type,
      targetId: result.identifier,
      targetLabel: result.label,
      details: {
        reason,
        previous_reason: result.reason,
        recorded_at: result.recorded_at,
        category: result.category,
      },
    });

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}
