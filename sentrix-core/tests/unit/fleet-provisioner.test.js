import { describe, it, expect, beforeEach, vi } from "vitest";
import { FleetProvisioner, MockDeployerAdapter } from "../../src/modules/discovery/fleet-provisioner.js";

describe("FleetProvisioner", () => {
  it("successfully orchestrates agent deployment via adapter and returns deployment result", async () => {
    const mockAdapter = new MockDeployerAdapter();
    const provisioner = new FleetProvisioner({ deployerAdapter: mockAdapter });

    const spec = {
      ip: "192.168.1.50",
      mac: "AA:BB:CC:DD:EE:FF",
      hostname: "Test-PC",
      userId: "user-1",
      action: "deploy"
    };

    const credentials = { username: "admin", password: "password" };

    const result = await provisioner.ensureDeployed(spec, credentials);

    expect(result.success).toBe(true);
    expect(result.deploymentId).toBe("mock-deployment-id-123");
    expect(mockAdapter.deployCalls.length).toBe(1);
    expect(mockAdapter.deployCalls[0].spec.ip).toBe("192.168.1.50");
    expect(mockAdapter.deployCalls[0].spec.mac).toBe("AA:BB:CC:DD:EE:FF");
  });

  it("handles deployment failure gracefully through the adapter seam", async () => {
    const mockAdapter = new MockDeployerAdapter();
    mockAdapter.shouldFail = true;
    const provisioner = new FleetProvisioner({ deployerAdapter: mockAdapter });

    const spec = {
      ip: "192.168.1.51",
      action: "deploy"
    };

    await expect(provisioner.ensureDeployed(spec, {})).rejects.toThrow("Mock deployment failure");
  });
});
