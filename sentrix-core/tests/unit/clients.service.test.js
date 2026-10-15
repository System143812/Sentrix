import { describe, it, expect, vi, beforeEach } from "vitest";
import { touchClientHeartbeat } from "../../src/modules/clients/clients.service.js";
import { ClientRepository } from "../../src/modules/clients/clients.repository.js";
import { processIncomingMetrics } from "../../src/modules/metrics/index.js";
import { recordUptimeStatus } from "../../src/modules/behavior/behavior.service.js";

vi.mock("../../src/modules/clients/clients.repository.js", () => ({
  ClientRepository: {
    findById: vi.fn(),
    updateStatus: vi.fn(),
  },
}));

vi.mock("../../src/modules/metrics/index.js", () => ({
  processIncomingMetrics: vi.fn(),
  normalizeMetrics: vi.fn(),
}));

vi.mock("../../src/modules/behavior/behavior.service.js", () => ({
  recordUptimeStatus: vi.fn(),
}));

describe("Client Services - touchClientHeartbeat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should NOT normalize or update metrics if heartbeat does NOT have telemetry", async () => {
    const mockId = "agent-123";
    const statusHeartbeat = {
      status: "online",
      timestamp: Date.now(),
      lastMetricsAt: Date.now() - 10000,
    };

    ClientRepository.findById.mockResolvedValue({ id: mockId, hostname: "Test-PC" });
    ClientRepository.updateStatus.mockResolvedValue(true);

    await touchClientHeartbeat(mockId, statusHeartbeat);

    expect(processIncomingMetrics).not.toHaveBeenCalled();
    expect(ClientRepository.updateStatus).toHaveBeenCalledWith(
      mockId,
      "online",
      expect.any(Number),
      null
    );
    expect(recordUptimeStatus).toHaveBeenCalledWith(mockId, "online", expect.any(Number));
  });

  it("should normalize and update metrics if heartbeat DOES have telemetry", async () => {
    const mockId = "agent-123";
    const telemetryHeartbeat = {
      status: "online",
      timestamp: Date.now(),
      system: {
        cpu: { usage: 15 },
        memory: { usage: 30 },
      },
    };

    const mockNormalized = { cpu: 15, ram: 30 };
    ClientRepository.findById.mockResolvedValue({ id: mockId, hostname: "Test-PC" });
    processIncomingMetrics.mockResolvedValue(mockNormalized);
    ClientRepository.updateStatus.mockResolvedValue(true);

    await touchClientHeartbeat(mockId, telemetryHeartbeat);

    expect(processIncomingMetrics).toHaveBeenCalledWith(mockId, telemetryHeartbeat, expect.any(Number));
    expect(ClientRepository.updateStatus).toHaveBeenCalledWith(
      mockId,
      "online",
      expect.any(Number),
      mockNormalized
    );
  });
});
