import { describe, it, expect, vi, beforeEach } from "vitest";
import { touchClientHeartbeat } from "./client.services.js";
import { ClientRepository } from "./client.repository.js";
import { processIncomingMetrics } from "./metrics/index.js";
import { recordUptimeStatus } from "./behavior.service.js";

vi.mock("./client.repository.js", () => ({
  ClientRepository: {
    findById: vi.fn(),
    updateStatus: vi.fn(),
  },
}));

vi.mock("./metrics/index.js", () => ({
  processIncomingMetrics: vi.fn(),
  normalizeMetrics: vi.fn(),
}));

vi.mock("./behavior.service.js", () => ({
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
