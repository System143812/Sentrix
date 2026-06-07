import {
  getDiscoverySnapshot,
  runDiscoveryScan,
  deployAgentToHost,
  getInterfaces as getInterfacesService,
} from "../services/discovery/index.js";
import { logAuditEvent } from "../services/audit.service.js";

export async function scan(req, res, next) {
  try {
    const { subnet } = req.body;
    const io = req.app.get("io");
    
    // Set initial status to scanning if we have a target
    if (subnet) {
      io?.to("dashboards").emit("discovery:update", {
        ...getDiscoverySnapshot(),
        status: "scanning",
        subnet,
        devices: [] // Clear old results from other subnets while scanning
      });
    }

    await runDiscoveryScan(subnet);
    const snapshot = getDiscoverySnapshot();
    io?.to("dashboards").emit("discovery:update", snapshot);

    res.json({
      success: true,
      data: snapshot,
    });
  } catch (error) {
    next(error);
  }
}

export async function getInterfaces(req, res, next) {
  try {
    res.json({
      success: true,
      data: getInterfacesService(),
    });
  } catch (error) {
    next(error);
  }
}

export async function getSnapshot(req, res, next) {
  try {
    res.json({
      success: true,
      data: getDiscoverySnapshot(),
    });
  } catch (error) {
    next(error);
  }
}

export async function deploy(req, res, next) {
  try {
    const { ip, credentials, action = "deploy" } = req.body;

    if (!ip) {
      return res
        .status(400)
        .json({ success: false, message: "IP address is required." });
    }

    const result = await deployAgentToHost(ip, credentials, req.user?.id, action);

    const auditAction =
      action === "activate"
        ? "agent_activate_requested"
        : action === "update"
          ? "agent_update_requested"
          : "agent_deploy_requested";

    await logAuditEvent({
      req,
      action: auditAction,
      targetType: "host",
      targetId: ip,
      targetLabel: ip,
      details: { action, success: Boolean(result.success), message: result.message },
    });

    if (!result.success) {
      return res.status(200).json({ success: false, ...result });
    }

    res.json({
      success: result.success,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}
