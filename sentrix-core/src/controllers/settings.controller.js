import * as settingsService from "../services/settings.service.js";
import { logAuditEvent } from "../services/audit.service.js";
import * as pruningService from "../services/pruning.service.js";

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

export async function getPruning(req, res, next) {
  try {
    const settings = await settingsService.getPruningSettings();
    res.json({ success: true, data: settings });
  } catch (error) {
    next(error);
  }
}

export async function updatePruning(req, res, next) {
  try {
    const settings = await settingsService.updatePruningSettings({
      settings: req.body,
      userId: req.user?.id,
    });

    await logAuditEvent({
      req,
      action: "pruning_settings_updated",
      targetType: "system_settings",
      targetId: "pruning",
      details: settings,
    });

    // Restart the background service to pick up the new interval
    pruningService.startPruningService();

    res.json({ success: true, data: settings });
  } catch (error) {
    next(error);
  }
}

export async function triggerPruning(req, res, next) {
  try {
    const deletedCount = await pruningService.runPruneSweep();

    await logAuditEvent({
      req,
      action: "manual_pruning_triggered",
      targetType: "system_maintenance",
      targetId: "pruning",
      details: { deletedCount },
    });

    res.json({ success: true, data: { deletedCount } });
  } catch (error) {
    next(error);
  }
}
