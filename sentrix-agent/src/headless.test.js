import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import { parseWindowsArgs } from "./headless.js";

describe("Headless Agent Windows Argument Parser (CommandLineToArgvW emulation)", () => {
  it("should parse simple space-separated arguments", () => {
    const args = parseWindowsArgs("arg1 arg2 arg3");
    expect(args).toEqual(["arg1", "arg2", "arg3"]);
  });

  it("should handle quoted arguments containing spaces", () => {
    const args = parseWindowsArgs('"arg with spaces" normalArg "another quoted"');
    expect(args).toEqual(["arg with spaces", "normalArg", "another quoted"]);
  });

  it("should handle paths ending in backslashes before space-separated quoted arguments", () => {
    const args = parseWindowsArgs('C:\\path\\with\\backslash\\ "quoted arg"');
    expect(args).toEqual(["C:\\path\\with\\backslash\\", "quoted arg"]);
  });

  it("should handle odd backslashes before quotes", () => {
    // 1 backslash before quote: literal quote inside argument
    const args = parseWindowsArgs('ab\\\"cd');
    expect(args).toEqual(['ab"cd']);
  });

  it("should handle empty quoted arguments", () => {
    const args = parseWindowsArgs('"" non-empty ""');
    expect(args).toEqual(["", "non-empty", ""]);
  });

  it("should handle embedded quotes correctly", () => {
    const args = parseWindowsArgs('foo"bar baz"qux');
    expect(args).toEqual(["foobar bazqux"]);
  });
});

describe("Headless Agent Single-Instance Lock & File Identity Lifecycle", () => {
  let testDir;
  let lockFilePath;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), "sentrix-lock-test-"));
    lockFilePath = path.join(testDir, "sentrix-agent.lock");
  });

  afterEach(() => {
    try {
      if (fs.existsSync(lockFilePath)) fs.unlinkSync(lockFilePath);
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {}
  });

  it("should acquire advisory lock atomically and write payload with token and PID using valid writeSync", () => {
    const token = crypto.randomUUID();
    let fd = null;
    let acquired = false;

    try {
      fd = fs.openSync(lockFilePath, "wx");
      const payload = JSON.stringify({
        pid: process.pid,
        token,
        time: Date.now(),
        execPath: process.execPath,
        scriptPath: "headless.js"
      }, null, 2);
      const expectedBytes = Buffer.byteLength(payload, "utf8");
      const bytesWritten = fs.writeSync(fd, payload);
      fs.closeSync(fd);
      fd = null;

      expect(bytesWritten).toBe(expectedBytes);
      acquired = true;
    } catch (err) {
      if (fd !== null) {
        try { fs.closeSync(fd); } catch {}
      }
      throw err;
    }

    expect(acquired).toBe(true);
    expect(fs.existsSync(lockFilePath)).toBe(true);
    const content = fs.readFileSync(lockFilePath, "utf8");
    const parsed = JSON.parse(content);
    expect(parsed.pid).toBe(process.pid);
    expect(parsed.token).toBe(token);
  });

  it("should cleanup partial lock write using attempt-scoped file identity verification", () => {
    const token = crypto.randomUUID();
    let fd = null;
    let attemptStats = null;
    let writeInitiated = false;

    try {
      fd = fs.openSync(lockFilePath, "wx");
      writeInitiated = true;
      try {
        attemptStats = fs.fstatSync(fd);
      } catch {}

      // Simulate write failure by throwing before completion
      throw new Error("Simulated write failure");
    } catch (err) {
      if (fd !== null) {
        try { fs.closeSync(fd); } catch {}
        fd = null;
      }

      // Cleanup logic mirroring headless.js implementation
      if (writeInitiated) {
        try {
          if (fs.existsSync(lockFilePath)) {
            const currentStats = fs.statSync(lockFilePath);
            const canVerifyIdentity = attemptStats && currentStats &&
              typeof attemptStats.ino === 'number' && typeof currentStats.ino === 'number' &&
              attemptStats.ino !== 0 && currentStats.ino !== 0;

            const matchesIdentity = canVerifyIdentity &&
              (attemptStats.ino === currentStats.ino && attemptStats.dev === currentStats.dev);

            if (matchesIdentity) {
              fs.unlinkSync(lockFilePath);
            }
          }
        } catch {}
      }
    }

    expect(fs.existsSync(lockFilePath)).toBe(false);
  });

  it("should prevent concurrent acquisition when lock file exists", () => {
    const token = crypto.randomUUID();
    const fd = fs.openSync(lockFilePath, "wx");
    const payload = JSON.stringify({
      pid: process.pid,
      token,
      time: Date.now(),
      execPath: process.execPath,
      scriptPath: "headless.js"
    });
    fs.writeSync(fd, payload);
    fs.closeSync(fd);

    expect(() => {
      fs.openSync(lockFilePath, "wx");
    }).toThrowError(/EEXIST/);
  });
});
