import {
  getDiscoverySnapshot,
  runDiscoveryScan,
  deployAgentToHost,
  getInterfaces as getInterfacesService,
} from "../services/discovery/index.js";
import { logAuditEvent } from "../services/audit.service.js";
import { getAllClients } from "../services/client.services.js";
import { signAgentCommand } from "../services/security.service.js";

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

    // --- Surgical Unlock Flow ---
    if (action === "update" && credentials) {
      const io = req.app.get("io");
      if (io) {
        // Find if this IP has an online agent
        const snapshot = getDiscoverySnapshot();
        const registered = await getAllClients();
        const snapshotDevice = snapshot.devices?.find((d) => d.ip === ip);
        const registeredDevice = registered.find(c => c.ip === ip);
        
        const targetAgentId = snapshotDevice?.registered_client_id || registeredDevice?.id;

        if (targetAgentId) {
          const rooms = io.sockets?.adapter?.rooms;
          const agentRoom = rooms?.get(`agent:${targetAgentId}`);
          const isAgentOnline = agentRoom && agentRoom.size > 0;

          if (!isAgentOnline) {
            console.log(`[CORE] Agent on ${ip} (ID: ${targetAgentId}) is offline. Skipping surgical unlock handshake.`);
          } else {
            console.log(`[CORE] Attempting surgical unlock for update on ${ip} (Agent ID: ${targetAgentId})...`);
            try {
              // Handshake: Wait for agent to confirm Master Key activation
              const signedCommand = await signAgentCommand(targetAgentId, "agent:prep-update");
              const response = await io.timeout(15000).to(`agent:${targetAgentId}`).emitWithAck("agent:command", { 
                ...signedCommand,
              });
              
              console.log(`[CORE] Surgical unlock response from agent on ${ip}:`, JSON.stringify(response));

              if (response?.[0]?.success) {
                console.log(`[CORE] Surgical unlock acknowledged by agent on ${ip}. Waiting 3s for system to settle...`);
                await new Promise(resolve => setTimeout(resolve, 3000));
                console.log(`[CORE] System settled. Proceeding with push.`);
              } else {
                console.warn(`[CORE] Agent on ${ip} refused unlock or reported failure:`, response?.[0]?.message || "No error message");
              }
            } catch (err) {
              console.error(`[CORE] Handshake TIMEOUT for surgical unlock on ${ip}. The signal never reached the agent or the agent hung.`);
            }
          }
        }
      }
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

    // --- Immediate Update Trigger ---
    if (action === "update" && result.success) {
      const io = req.app.get("io");
      const snapshot = getDiscoverySnapshot();
      const registered = await getAllClients();
      const snapshotDevice = snapshot.devices?.find((d) => d.ip === ip);
      const registeredDevice = registered.find(c => c.ip === ip);
      const targetAgentId = snapshotDevice?.registered_client_id || registeredDevice?.id;
      
      if (targetAgentId) {
        console.log(`[CORE] Sending immediate update trigger to ${ip} (Agent ID: ${targetAgentId})...`);
        const signedCommand = await signAgentCommand(targetAgentId, "update");
        io?.to(`agent:${targetAgentId}`).emit("agent:command", signedCommand);
      }
    }

    res.json({
      success: result.success,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}
