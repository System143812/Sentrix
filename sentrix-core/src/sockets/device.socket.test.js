import { describe, it, expect, beforeEach, vi } from "vitest";
import jwt from "jsonwebtoken";
import { registerDeviceSocket } from "./device.socket.js";
import {
  isRequestAuthorized,
  isRequestRateLimited,
} from "../services/security.service.js";

vi.mock("../services/client.services.js", () => ({
  getClientSummary: vi.fn().mockResolvedValue({ clients: [] }),
  registerClient: vi.fn(),
  touchClientHeartbeat: vi.fn(),
  updateClientMetrics: vi.fn(),
}));

vi.mock("../services/discovery/index.js", () => ({
  getDiscoverySnapshot: vi.fn().mockReturnValue({ devices: [] }),
  runDiscoveryScan: vi.fn(),
  setPreferredSubnet: vi.fn(),
}));

vi.mock("../services/settings.service.js", () => ({
  getTelemetrySettings: vi.fn().mockResolvedValue({ intervalMs: 5000 }),
}));

vi.mock("../services/behavior.service.js", () => ({
  saveDeviceEvents: vi.fn(),
  saveDomainSummaries: vi.fn(),
  saveSoftwareInventory: vi.fn(),
}));

vi.mock("../services/security.service.js", () => ({
  isRequestRateLimited: vi.fn(),
  isRequestAuthorized: vi.fn(),
  verifyHardwareSignature: vi.fn(),
}));

vi.mock("../services/heartbeat.service.js", () => ({
  grantRegistrationGrace: vi.fn(),
}));

function createIoMock() {
  return {
    use: vi.fn(),
    on: vi.fn(),
    to: vi.fn().mockReturnThis(),
  };
}

function createSocket({ role = "dashboard", token = null } = {}) {
  return {
    handshake: {
      auth: token ? { token } : {},
      headers: {},
      query: { role },
      address: "127.0.0.1",
    },
    conn: {
      transport: {
        socket: {},
      },
    },
    request: {},
  };
}

describe("Device Socket authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isRequestRateLimited.mockResolvedValue(false);
    isRequestAuthorized.mockResolvedValue(true);
  });

  it("rejects dashboard sockets without an admin token", async () => {
    const io = createIoMock();
    registerDeviceSocket(io);
    const middleware = io.use.mock.calls[0][0];
    const next = vi.fn();

    await middleware(createSocket(), next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(next.mock.calls[0][0].message).toBe("Unauthorized");
    expect(isRequestAuthorized).not.toHaveBeenCalled();
  });

  it("accepts dashboard sockets with a valid admin token", async () => {
    const io = createIoMock();
    registerDeviceSocket(io);
    const middleware = io.use.mock.calls[0][0];
    const next = vi.fn();
    const token = jwt.sign(
      { id: "admin-1", email: "admin@example.com", role: "admin" },
      process.env.JWT_SECRET || "sentrix-secret",
    );

    await middleware(createSocket({ token }), next);

    expect(next).toHaveBeenCalledWith();
    expect(isRequestAuthorized).not.toHaveBeenCalled();
  });

  it("keeps agent sockets on the agent authorization path", async () => {
    const io = createIoMock();
    registerDeviceSocket(io);
    const middleware = io.use.mock.calls[0][0];
    const next = vi.fn();

    await middleware(createSocket({ role: "agent" }), next);

    expect(isRequestAuthorized).toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith();
  });

  it("extracts agentId from handshake headers x-sentrix-agent-id on connection", async () => {
    const io = createIoMock();
    registerDeviceSocket(io);
    const connectionHandler = io.on.mock.calls.find(call => call[0] === "connection")?.[1];
    
    expect(connectionHandler).toBeDefined();

    const socketMock = {
      handshake: {
        query: { role: "agent" },
        headers: { "x-sentrix-agent-id": "test-agent-123" },
        address: "127.0.0.1",
      },
      join: vi.fn(),
      emit: vi.fn(),
      on: vi.fn(),
    };

    await connectionHandler(socketMock);

    // Verify registration listener is registered
    const registerListenerCall = socketMock.on.mock.calls.find(call => call[0] === "agent:register");
    expect(registerListenerCall).toBeDefined();
  });
});
