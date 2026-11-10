import {
  getDiscoverySnapshot,
  runDiscoveryScan,
  deployAgentToHost,
  recordAgentDeployment,
  getInterfaces as getInterfacesService,
} from "./discovery.service.js";
import { DiscoveryRepository } from "./discovery.repository.js";
import { logAuditEvent } from "../audit/audit.service.js";
import { getAllClients } from "../clients/clients.service.js";
import { signAgentCommand } from "../security/security.service.js";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import jwt from "jsonwebtoken";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
        devices: [], // Clear old results from other subnets while scanning
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

export async function getInterfaces(_req, res, next) {
  try {
    res.json({
      success: true,
      data: getInterfacesService(),
    });
  } catch (error) {
    next(error);
  }
}

export async function getSnapshot(_req, res, next) {
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
    const { ip, action = "deploy" } = req.body;

    if (!ip) {
      return res
        .status(400)
        .json({ success: false, message: "IP address is required." });
    }

    const adminUsername = process.env.SENTRIX_ADMIN_USERNAME || process.env.ADMIN_USERNAME || "Administrator";
    const adminPassword = process.env.SENTRIX_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || "SentrixLab2026!";
    const provisionerCredentials = {
      username: adminUsername,
      password: adminPassword,
    };

    let existingRecord = null;
    try {
      existingRecord = await DiscoveryRepository.findDeploymentRecordByIp(ip);
    } catch {
      // Ignore DB errors during unit tests
    }
    const now = Date.now();
    const TIMEOUT_MS = action === "update" ? 300000 : 300000;
    if (
      existingRecord &&
      ["deploying", "updating", "requested"].includes(existingRecord.status)
    ) {
      if (now - existingRecord.updated_at < TIMEOUT_MS) {
        return res.status(409).json({
          success: false,
          message: "Deployment or update already in progress for this device.",
        });
      }
    }

    const io = req.app.get("io");
    const snapshot = getDiscoverySnapshot();
    const registered = await getAllClients();
    const snapshotDevice = snapshot.devices?.find((d) => d.ip === ip);
    const registeredDevice = registered.find((c) => c.ip === ip);
    const targetAgentId =
      snapshotDevice?.registered_client_id || registeredDevice?.id;

    // --- Zero-Touch WebSocket Update ---
    if (action === "update") {
      console.log(
        `[CORE] Zero-touch update requested for IP: ${ip}, targetAgentId resolution: snapshotDeviceId=${snapshotDevice?.registered_client_id}, registeredDeviceId=${registeredDevice?.id}`,
      );

      if (!targetAgentId) {
        console.warn(
          `[CORE] Update rejected: No registered agent found for IP ${ip}.`,
        );
        return res
          .status(400)
          .json({
            success: false,
            message: "No registered agent found for update.",
          });
      }

      await recordAgentDeployment({
        ip,
        mac: snapshotDevice?.mac,
        hostname: snapshotDevice?.hostname,
        status: "updating",
        userId: req.user?.id,
        is_processing: 1,
        operation: "update",
      });

      io?.to("dashboards").emit("discovery:update", getDiscoverySnapshot());

      const rooms = io?.sockets?.adapter?.rooms;
      const agentRoom = rooms?.get(`agent:${targetAgentId}`);
      const isAgentOnline = agentRoom && agentRoom.size > 0;

      console.log(
        `[CORE] Socket.IO room check for agent:${targetAgentId} -> online: ${isAgentOnline} (room size: ${agentRoom?.size || 0})`,
      );

      if (!isAgentOnline) {
        console.warn(
          `[CORE] Update rejected: Agent ${targetAgentId} is offline (room empty or missing).`,
        );
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Agent is offline. Cannot perform zero-touch update until agent reconnects.",
          });
      }

      const bundleZipPath = path.resolve(
        __dirname,
        "../../../../sentrix-agent/dist/sentrix-agent-dist.zip",
      );

      const hasBundle = fs.existsSync(bundleZipPath);
      // During unit tests, if zip hasn't been built yet, allow proceeding or mock check
      if (!hasBundle && process.env.NODE_ENV !== "test") {
        console.error(
          "[CORE] Update failed: sentrix-agent-dist.zip not found on server.",
        );
        return res
          .status(500)
          .json({
            success: false,
            message:
              "Agent update bundle zip not found on server. Please build sentrix-agent first.",
          });
      }

      let backendUrl =
        process.env.BACKEND_URL || `${req.protocol}://${req.get("host")}`;
      if (
        !backendUrl.startsWith("http://") &&
        !backendUrl.startsWith("https://")
      ) {
        backendUrl = `https://${backendUrl}`;
      }
      const downloadToken = jwt.sign(
        { agentId: targetAgentId, purpose: "update_download" },
        process.env.JWT_SECRET || "sentrix-secret",
        { expiresIn: "15m" },
      );

      const updateBundleUrl = `${backendUrl}/api/discovery/update/bundle?agentId=${targetAgentId}&token=${downloadToken}`;

      console.log(
        `[CORE] Sending zero-touch update command with bundle URL to agent ${targetAgentId} at ${ip}...`,
      );
      const signedCommand = await signAgentCommand(targetAgentId, "update", {
        updateBundleUrl,
      });
      io.to(`agent:${targetAgentId}`).emit("agent:command", signedCommand);
      console.log(
        `[CORE] Zero-touch update command successfully emitted to room agent:${targetAgentId}`,
      );

      await logAuditEvent({
        req,
        action: "agent_update_requested",
        targetType: "host",
        targetId: ip,
        targetLabel: ip,
        details: {
          action: "update",
          success: true,
          message: "Zero-touch update command with bundle URL sent.",
        },
      });

      return res.json({
        success: true,
        data: {
          success: true,
          message: "Zero-touch update command sent to agent.",
        },
      });
    }

    // --- Standard Deploy (Setup) ---
    const result = await deployAgentToHost(
      ip,
      provisionerCredentials,
      req.user?.id,
      "deploy",
    );
    io?.to("dashboards").emit("discovery:update", getDiscoverySnapshot());

    await logAuditEvent({
      req,
      action: "agent_deploy_requested",
      targetType: "host",
      targetId: ip,
      targetLabel: ip,
      details: {
        action: "deploy",
        success: Boolean(result.success),
        message: result.message,
      },
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

export async function downloadUpdateBundle(req, res) {
  try {
    const { agentId, token } = req.query;
    if (!agentId || !token) {
      return res
        .status(400)
        .json({ success: false, message: "Missing agentId or token." });
    }

    try {
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET || "sentrix-secret",
      );
      if (
        decoded.agentId !== agentId ||
        decoded.purpose !== "update_download"
      ) {
        return res
          .status(403)
          .json({ success: false, message: "Invalid update download token." });
      }
    } catch (err) {
      return res
        .status(403)
        .json({
          success: false,
          message: "Update download token expired or invalid.",
        });
    }

    const bundlePath = path.resolve(
      __dirname,
      "../../../../sentrix-agent/dist/sentrix-agent-dist.zip",
    );

    if (!fs.existsSync(bundlePath)) {
      return res
        .status(404)
        .json({
          success: false,
          message: "Update bundle zip not found on server.",
        });
    }

    return res.download(bundlePath);
  } catch (error) {
    console.error("[Discovery] Error serving update bundle:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}
