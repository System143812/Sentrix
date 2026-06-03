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
      req,
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
      req,
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
    const { reason = "", target = "all" } = req.body;
    const result = await auditService.revokeAuthorityRecord(req.params.id, {
      revokedBy: req.user?.id || null,
      reason,
      target
    });

    const isWhitelist = result.category === "whitelist";
    let actionLabel = result.label;
    if (target === "ip" && result.ip_address) actionLabel = `IP: ${result.ip_address}`;
    else if (target === "mac" && result.mac_address) actionLabel = `MAC: ${result.mac_address}`;
    else if (target === "all" && result.ip_address && result.mac_address) actionLabel = `${result.ip_address} & ${result.mac_address}`;

    await auditService.logAuditEvent({
      req,
      action: isWhitelist ? "REVOKE_TRUST" : "RESTORE_ACCESS",
      targetType: result.subject_type,
      targetId: result.identifier,
      targetLabel: isWhitelist ? result.label : `Restored ${actionLabel}`,
      details: {
        reason,
        target,
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
