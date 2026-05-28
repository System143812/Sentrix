import { describe, it, expect, vi, beforeEach } from "vitest";
import { runMaintenanceAction, MAINTENANCE_COMMANDS } from "./maintenance.js";
import { exec } from "child_process";

// Mock child_process.exec
vi.mock("child_process", () => ({
  exec: vi.fn((cmd, options, callback) => {
    // If the callback is the second argument
    if (typeof options === "function") {
      options(null, { stdout: "success", stderr: "" });
    } else {
      callback(null, { stdout: "success", stderr: "" });
    }
  })
}));

describe("Maintenance Utility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.SENTRIX_AGENT_DATA_DIR;
  });

  it("should generate a broadcast command that uses EncodedCommand", () => {
    const text = "Hello Lab";
    const command = MAINTENANCE_COMMANDS["broadcast-message"](text, "");
    
    expect(command).toContain("-EncodedCommand");
    
    // Decode the command to verify contents
    const encodedPart = command.split("-EncodedCommand ")[1];
    const decoded = Buffer.from(encodedPart, "base64").toString("utf16le");
    
    expect(decoded).toContain("Modules\\BurntToast");
    expect(decoded).toContain("New-BurntToastNotification");
    expect(decoded).toContain("msg *");
    expect(decoded).toContain("Hello Lab");
  });

  it("should generate a broadcast command with specific dataDir", () => {
    const text = "Hello Lab";
    const dataDir = "C:\\CustomData";
    const command = MAINTENANCE_COMMANDS["broadcast-message"](text, dataDir);
    
    const encodedPart = command.split("-EncodedCommand ")[1];
    const decoded = Buffer.from(encodedPart, "base64").toString("utf16le");
    
    expect(decoded).toContain("C:\\CustomData\\Modules\\BurntToast");
  });

  it("should escape single quotes in broadcast messages", () => {
    const text = "Admin's Message";
    const dataDir = "C:\\Sentrix";
    const command = MAINTENANCE_COMMANDS["broadcast-message"](text, dataDir);
    
    const encodedPart = command.split("-EncodedCommand ")[1];
    const decoded = Buffer.from(encodedPart, "base64").toString("utf16le");
    
    // PowerShell escapes ' with '' in single-quoted strings
    expect(decoded).toContain("Admin''s Message");
  });

  it("should execute a maintenance action successfully", async () => {
    const result = await runMaintenanceAction("network-reset");
    
    expect(result.success).toBe(true);
    expect(result.message).toContain("successfully");
    expect(exec).toHaveBeenCalled();
  });

  it("should return failure for unknown actions", async () => {
    const result = await runMaintenanceAction("non-existent-action");
    
    expect(result.success).toBe(false);
    expect(result.message).toContain("Unknown");
  });

  it("should handle execution errors gracefully", async () => {
    // Mock a failure
    vi.mocked(exec).mockImplementationOnce((cmd, options, callback) => {
      const cb = typeof options === "function" ? options : callback;
      cb(new Error("Access Denied"), { stdout: "", stderr: "Error" });
      return {};
    });

    const result = await runMaintenanceAction("system-purge");
    
    expect(result.success).toBe(false);
    expect(result.message).toContain("Access Denied");
  });
});
