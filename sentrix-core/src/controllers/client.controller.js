import * as clientService from "../services/client.services.js";
import { AppError } from "../utils/appError.utils.js";
import { logAuditEvent } from "../services/audit.service.js";

const ALLOWED_DEVICE_COMMANDS = new Set([
  "shutdown",
  "restart",
  "sleep",
  "lock",
  "update",
]);

async function emitAgentCommand(req, clientId, command, args = {}) {
  const io = req.app.get("io");
  const room = `agent:${clientId}`;
  const sockets = await io.in(room).fetchSockets();

  if (sockets.length === 0) {
    throw new AppError(400, "Agent is offline or not connected.");
  }

  try {
    return await sockets[0].timeout(5000).emitWithAck("agent:command", {
      command,
      args,
    });
  } catch (error) {
    if (error.name === "TimeoutError") {
      throw new AppError(504, "Agent did not respond in time. The command might still be running.");
    }

    throw error;
  }
}

export async function killClientProcess(req, res, next) {
  try {
    const { id, pid } = req.params;
    const client = await clientService.getClientById(id);
    
    try {
      const result = await emitAgentCommand(req, id, "kill-process", {
        pid: parseInt(pid, 10),
      });

      if (result.success) {
        await logAuditEvent({
          req,
          action: "process_ended",
          targetType: "client_process",
          targetId: `${id}:${pid}`,
          targetLabel: `${client?.hostname || "Device"} PID ${pid}`,
          macAddress: client?.mac,
          details: { clientId: id, pid: parseInt(pid, 10) },
        });

        res.status(200).json({
          success: true,
          message: "Process terminated successfully.",
        });
      } else {
        const fullMessage = result.conclusion 
          ? `${result.message} ${result.conclusion}` 
          : (result.message || "Failed to terminate process.");
          
        throw new AppError(400, fullMessage);
      }
    } catch (err) {
      if (err.name === "TimeoutError") {
        throw new AppError(504, "Agent did not respond in time. The process might still be running.");
      }
      throw err;
    }
  } catch (error) {
    next(error);
  }
}

export async function sendClientCommand(req, res, next) {
  try {
    const { id } = req.params;
    const { command, payload = {} } = req.body || {};

    if (!ALLOWED_DEVICE_COMMANDS.has(command)) {
      throw new AppError(400, "Unsupported remote command.");
    }

    const client = await clientService.getClientById(id);
    const result = await emitAgentCommand(req, id, command, payload);

    if (!result?.success) {
      throw new AppError(400, result?.message || "Remote command failed.");
    }

    await logAuditEvent({
      req,
      action: `remote_${command}`,
      targetType: "client",
      targetId: id,
      targetLabel: client?.hostname,
      macAddress: client?.mac,
      details: { command, payload },
    });

    return res.status(200).json({
      success: true,
      message: result.message || "Remote command accepted.",
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function getAllClients(req, res, next) {
  try {
    const data = await clientService.getClientSummary();
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function getClient(req, res, next) {
  try {
    const client = await clientService.getClientById(req.params.id);

    if (!client) {
      return res.status(404).json({
        success: false,
        message: "Client not found.",
      });
    }

    return res.json({
      success: true,
      data: client,
    });
  } catch (error) {
    next(error);
  }
}

export async function getClientMetrics(req, res, next) {
  try {
    const data = await clientService.getClientMetrics(req.params.id, {
      range: req.query.range,
      limit: req.query.limit,
    });

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Client not found.",
      });
    }

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
}

export async function getClientHardware(req, res, next) {
  try {
    const data = await clientService.getClientHardwareDetails(req.params.id);

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Client not found.",
      });
    }

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateClientGroup(req, res, next) {
  try {
    const client = await clientService.updateClientGroup(
      req.params.id,
      req.body.group,
    );

    if (!client) {
      return res.status(404).json({
        success: false,
        message: "Client not found.",
      });
    }

    await logAuditEvent({
      req,
      action: "device_group_updated",
      targetType: "client",
      targetId: req.params.id,
      targetLabel: client.hostname,
      macAddress: client.mac,
      details: { group: client.group },
    });

    const io = req.app.get("io");
    io.to("dashboards").emit(
      "devices:update",
      await clientService.getClientSummary(),
    );

    return res.json({
      success: true,
      data: client,
    });
  } catch (error) {
    next(error);
  }
}

export async function archiveClient(req, res, next) {
  try {
    const client = await clientService.getClientById(req.params.id);
    const success = await clientService.archiveClient(req.params.id);

    if (!success) {
      return res.status(404).json({
        success: false,
        message: "Client not found.",
      });
    }

    await logAuditEvent({
      req,
      action: "device_archived",
      targetType: "client",
      targetId: req.params.id,
      targetLabel: client?.hostname,
      macAddress: client?.mac,
    });

    const io = req.app.get("io");
    io.to("dashboards").emit(
      "devices:update",
      await clientService.getClientSummary(),
    );

    return res.json({ success: true, message: "Client archived." });
  } catch (error) {
    next(error);
  }
}

export async function getClientProcesses(req, res, next) {
  try {
    const { id } = req.params;
    const processes = await clientService.getClientProcesses(id);
    res.json({ success: true, data: processes });
  } catch (error) {
    next(error);
  }
}

export async function getClientNetworkActivity(req, res, next) {
  try {
    const { id } = req.params;
    const activity = await clientService.getClientNetworkActivity(id);
    res.json({ success: true, data: activity });
  } catch (error) {
    next(error);
  }
}

export async function getClientActivityHistory(req, res, next) {
  try {
    const { id } = req.params;
    const history = await clientService.getClientActivityHistory(id);
    res.json({ success: true, data: history });
  } catch (error) {
    next(error);
  }
}

export async function getClientPeripheralHistory(req, res, next) {
  try {
    const { id } = req.params;
    const history = await clientService.getClientPeripheralHistory(id, {
      startDate: req.query.startDate,
      endDate: req.query.endDate,
    });
    res.json({ success: true, data: history });
  } catch (error) {
    next(error);
  }
}

async function updatePeripheralLifecycle(req, res, next, action) {
  try {
    const { id, key } = req.params;
    const note = req.body?.note || "";
    const decodedKey = decodeURIComponent(key);
    const handlers = {
      resolve: clientService.resolveClientPeripheral,
      archive: clientService.archiveClientPeripheral,
      recover: clientService.recoverClientPeripheral,
    };
    const result = await handlers[action](id, decodedKey, note);

    if (!result) {
      return res.status(404).json({
        success: false,
        message: "Peripheral not found.",
      });
    }

    const client = await clientService.getClientById(id);
    const auditActions = {
      resolve: "peripheral_resolved",
      archive: "peripheral_archived",
      recover: "peripheral_recovered",
    };
    await logAuditEvent({
      req,
      action: auditActions[action],
      targetType: "client_peripheral",
      targetId: `${id}:${decodedKey}`,
      targetLabel: result.name,
      macAddress: client?.mac,
      details: { clientId: id, peripheralKey: decodedKey, note },
    });

    req.app.get("io")?.to("dashboards").emit(
      "devices:update",
      await clientService.getClientSummary(),
    );

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export function resolvePeripheral(req, res, next) {
  return updatePeripheralLifecycle(req, res, next, "resolve");
}

export function archivePeripheral(req, res, next) {
  return updatePeripheralLifecycle(req, res, next, "archive");
}

export function recoverPeripheral(req, res, next) {
  return updatePeripheralLifecycle(req, res, next, "recover");
}

export async function getClientEvents(req, res, next) {
  try {
    const events = await clientService.getClientEvents(req.params.id, req.query);
    res.json({ success: true, data: events });
  } catch (error) {
    next(error);
  }
}

export async function getClientDomains(req, res, next) {
  try {
    const domains = await clientService.getClientDomains(req.params.id, req.query);
    res.json({ success: true, data: domains });
  } catch (error) {
    next(error);
  }
}

export async function getClientSoftware(req, res, next) {
  try {
    const software = await clientService.getClientSoftware(req.params.id);
    res.json({ success: true, data: software });
  } catch (error) {
    next(error);
  }
}

export async function getClientHealth(req, res, next) {
  try {
    const health = await clientService.getClientHealth(req.params.id, req.query);
    res.json({ success: true, data: health });
  } catch (error) {
    next(error);
  }
}

export async function getClientAnomalies(req, res, next) {
  try {
    const anomalies = await clientService.getClientAnomalies(req.params.id, req.query);
    res.json({ success: true, data: anomalies });
  } catch (error) {
    next(error);
  }
}
