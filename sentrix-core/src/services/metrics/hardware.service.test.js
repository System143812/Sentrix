import { describe, it, expect, vi, beforeEach } from "vitest";
import pool from "../../lib/database.js";
import { saveHardwareDetails, getClientPeripheralHistory } from "./hardware.service.js";

vi.mock("../../lib/database.js", () => ({
  default: {
    getConnection: vi.fn(),
    query: vi.fn(),
  },
}));

describe("Hardware Service - Peripheral Tracking", () => {
  const mockClientId = "test-agent-id";
  const now = Date.now();

  let mockConnection;

  beforeEach(() => {
    vi.clearAllMocks();
    mockConnection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi.fn(),
    };
    pool.getConnection.mockResolvedValue(mockConnection);
    pool.query.mockResolvedValue([[{ hostname: "TestPC", mac: "00:11:22:33:44:55" }]]);
  });

  it("should mark a peripheral as missing when it is removed from a snapshot after the 30s dampening window", async () => {
    // 1. Setup: Peripheral exists in the database as 'connected'
    const mockExistingRows = [
      {
        peripheral_key: "usb:mouse-id",
        name: "USB Mouse",
        category: "Mouse",
        vendor: "Logitech",
        status: "connected",
        last_seen_at: now - 35000, // 35 seconds ago (Exceeds 30s status dampening)
      },
    ];
    mockConnection.query.mockImplementation((sql, params) => {
      if (sql.includes("SELECT * FROM client_peripheral_inventory")) return Promise.resolve([mockExistingRows]);
      return Promise.resolve([[]]);
    });

    // 2. Act: Agent sends hardware details WITHOUT the mouse (Successful but empty scan)
    const details = {
      usbDevices: [], 
      peripherals: {},
      specs: {},
    };

    await saveHardwareDetails(mockClientId, details);

    // 3. Assert: The database should have been updated immediately
    const updateCall = mockConnection.query.mock.calls.find(call => 
      call[0] && typeof call[0] === 'string' && call[0].includes("UPDATE client_peripheral_inventory") && call[0].includes("SET status = 'missing'")
    );
    
    expect(updateCall).toBeDefined();
  });

  it("should record connection events for new peripherals", async () => {
    mockConnection.query.mockResolvedValue([[]]); // No existing peripherals

    const details = {
      usbDevices: [{ name: "New Mouse", type: "Mouse", manufacturer: "Razer", deviceId: "mouse-123" }],
      peripherals: {},
      specs: {},
    };

    await saveHardwareDetails(mockClientId, details);

    const eventCall = mockConnection.query.mock.calls.find(call => 
      call[0] && typeof call[0] === 'string' && call[0].includes("INSERT INTO client_peripheral_events") && call[0].includes("'connected'")
    );
    
    expect(eventCall).toBeDefined();
    expect(eventCall[1]).toContain(mockClientId);
    expect(eventCall[1]).toContain("usb:mouse-123");
  });
});
