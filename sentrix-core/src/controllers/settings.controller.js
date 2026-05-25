import * as settingsService from "../services/settings.service.js";
import { logAuditEvent } from "../services/audit.service.js";

export async function getTelemetry(req, res, next) {
  try {
    const settings = await settingsService.getTelemetrySettings();
    res.json({ success: true, data: settings });
  } catch (error) {
    next(error);
  }
}

export async function updateTelemetry(req, res, next) {
  try {
    const settings = await settingsService.updateTelemetrySettings({
      intervalMs: req.body?.intervalMs,
      userId: req.user?.id,
    });

    await logAuditEvent({
      req,
      action: "telemetry_interval_updated",
      targetType: "system_settings",
      targetId: "telemetry",
      targetLabel: `${settings.intervalMs} ms`,
      details: settings,
    });

    req.app.get("io")?.to("agents").emit("settings:telemetry", settings);
    res.json({ success: true, data: settings });
  } catch (error) {
    next(error);
  }
}
