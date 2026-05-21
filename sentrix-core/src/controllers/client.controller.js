import * as clientService from "../services/client.services.js";
import { AppError } from "../utils/appError.utils.js";

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
    
    try {
      const result = await emitAgentCommand(req, id, "kill-process", {
        pid: parseInt(pid, 10),
      });

      console.log(`[CORE] Agent result for kill-process (PID ${pid}):`, result);

      if (result.success) {
        res.status(200).json({
          success: true,
          message: "Process terminated successfully.",
        });
      } else {
        const fullMessage = result.conclusion 
          ? `${result.message} ${result.conclusion}` 
          : (result.message || "Failed to terminate process.");
          
        console.error(`[CORE] Termination failed: ${fullMessage}`);
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

    const result = await emitAgentCommand(req, id, command, payload);

    if (!result?.success) {
      throw new AppError(400, result?.message || "Remote command failed.");
    }

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
    const success = await clientService.archiveClient(req.params.id);

    if (!success) {
      return res.status(404).json({
        success: false,
        message: "Client not found.",
      });
    }

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
