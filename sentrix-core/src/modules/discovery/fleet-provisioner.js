import crypto from "crypto";
import { ClientRepository } from "../clients/clients.repository.js";
import { DiscoveryRepository } from "./discovery.repository.js";
import { generateProvisioningToken } from "../security/security.service.js";

/**
 * SmbDeployerAdapter satisfies the DeployerAdapter interface for production use.
 * It encapsulates SMB file copying, manifest generation, and watchdog activation.
 */
export class SmbDeployerAdapter {
  async deploy(spec, credentials) {
    // Delegates to existing robust deployAgentViaSMB implementation
    const { deployAgentToHost } = await import("./deployer.js");
    return await deployAgentToHost(spec.ip, credentials, null, spec.agentId, spec.token, spec.action || "deploy");
  }
}

/**
 * MockDeployerAdapter satisfies the DeployerAdapter interface for testing and simulation.
 */
export class MockDeployerAdapter {
  constructor() {
    this.deployCalls = [];
    this.shouldFail = false;
  }

  async deploy(spec, credentials) {
    if (this.shouldFail) {
      throw new Error("Mock deployment failure");
    }
    this.deployCalls.push({ spec, credentials });
    return {
      success: true,
      deploymentId: spec.deploymentId || "mock-deployment-id-123",
      manifest: [{ relPath: "sentrix-agent.exe", size: 1024, hash: "abc123hash" }]
    };
  }
}

/**
 * FleetProvisioner encapsulates the deep module interface for agent deployment and fleet coordination.
 */
export class FleetProvisioner {
  constructor({ deployerAdapter } = {}) {
    this.deployerAdapter = deployerAdapter || new SmbDeployerAdapter();
  }

  async ensureDeployed(spec, credentials) {
    const cleanIp = String(spec?.ip || "").trim();
    if (!cleanIp) {
      throw new Error("Invalid or missing IP address for fleet provisioning.");
    }

    let agentId = spec.agentId;
    let token = spec.token;

    // Identity preservation lookup
    if (!agentId) {
      try {
        const allClients = await ClientRepository.findAllIncludingArchived();
        const existingClient = allClients.find(c => c.ip === cleanIp || (spec.mac && c.mac && c.mac.toUpperCase() === spec.mac.toUpperCase()));
        if (existingClient) {
          agentId = existingClient.id;
        }
      } catch (err) {
        console.warn(`[FleetProvisioner] Failed to query existing client for identity preservation:`, err.message);
      }
    }

    if (!agentId) {
      agentId = crypto.randomUUID();
    }

    if (!token) {
      token = await generateProvisioningToken(agentId);
    }

    const enhancedSpec = {
      ...spec,
      ip: cleanIp,
      agentId,
      token
    };

    // Execute via adapter seam
    const result = await this.deployerAdapter.deploy(enhancedSpec, credentials);
    return result;
  }
}
