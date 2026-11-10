import { describe, it, expect, vi, beforeEach } from "vitest";
import { runMaintenanceAction, MAINTENANCE_COMMANDS } from "./maintenance.js";
import { exec } from "child_process";
import fs from "fs";

// Mock child_process.exec and execFile
vi.mock("child_process", () => ({
  exec: vi.fn((cmd, options, callback) => {
    if (typeof options === "function") {
      options(null, { stdout: "success", stderr: "" });
    } else {
      callback(null, { stdout: "success", stderr: "" });
    }
  }),
  execFile: vi.fn((cmd, args, options, callback) => {
    const cb = typeof options === "function" ? options : callback;
    if (cb) cb(null, { stdout: "success", stderr: "" });
    return {};
  })
}));

vi.mock("fs", async () => {
  const actual = await vi.importActual("fs");
  return {
    ...actual,
    existsSync: vi.fn((p) => typeof p === "string" && p.includes("broadcast-dialog.ps1") && !p.includes("CustomData") && !p.includes("Sentrix")),
    writeFileSync: vi.fn(),
    copyFileSync: vi.fn(),
  };
});

describe("Maintenance Utility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.SENTRIX_AGENT_DATA_DIR;
  });

  it("should generate a broadcast command that uses EncodedCommand with BurntToast support", () => {
    const text = "Hello Lab";
    const command = MAINTENANCE_COMMANDS["broadcast-message"](text, "");

    expect(command).toContain("-EncodedCommand");

    // Decode the command to verify contents
    const encodedPart = command.split("-EncodedCommand ")[1];
    const decoded = Buffer.from(encodedPart, "base64").toString("utf16le");

    expect(decoded).toContain("New-BurntToastNotification");
    expect(decoded).toContain("Hello Lab");
  });

  it("should handle BurntToast module loading and logo paths", () => {
    const text = "Alert & Warning <test>";
    const command = MAINTENANCE_COMMANDS["broadcast-message"](text, "");

    const encodedPart = command.split("-EncodedCommand ")[1];
    const decoded = Buffer.from(encodedPart, "base64").toString("utf16le");

    expect(decoded).toContain("BurntToast.psd1");
    expect(decoded).toContain("sentrix-dark.png");
  });

  it("should execute a maintenance action successfully", async () => {
    const result = await runMaintenanceAction("network-reset");

    expect(result.success).toBe(true);
    expect(result.message).toContain("successfully");
    expect(exec).toHaveBeenCalled();
  });

  it("should generate workspace-reset command with extended exclusions, COM Shell explorer folders, and graceful close", () => {
    const cmd = MAINTENANCE_COMMANDS["workspace-reset"];
    const encodedPart = cmd.split("-EncodedCommand ")[1];
    const decoded = Buffer.from(encodedPart, "base64").toString("utf16le");

    expect(decoded).toContain("explorer");
    expect(decoded).toContain("Shell.Application");
    expect(decoded).toContain("SystemSettings");
    expect(decoded).toContain("ApplicationFrameHost");
    expect(decoded).toContain("CloseMainWindow");
    expect(decoded).toContain("Start-Sleep");
    expect(decoded).toContain("-notcontains");
  });

  it("should generate system-purge command including Clear-RecycleBin, user profiles AppData Local Temp, and system temp paths", () => {
    const cmd = MAINTENANCE_COMMANDS["system-purge"];
    const encodedPart = cmd.split("-EncodedCommand ")[1];
    const decoded = Buffer.from(encodedPart, "base64").toString("utf16le");

    expect(decoded).toContain("Clear-RecycleBin");
    expect(decoded).toContain("$env:TMP");
    expect(decoded).toContain("$env:TEMP");
    expect(decoded).toContain("C:\\Users");
    expect(decoded).toContain("AppData\\Local\\Temp");
    expect(decoded).toContain("$Recycle.Bin");
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
