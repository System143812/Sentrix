import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SessionManager } from "./session-manager.js";
import { execFile } from "child_process";
import fs from "fs";

vi.mock("../utils/ipc.js", () => ({
  sendMessage: vi.fn().mockResolvedValue({ success: true, type: "pong", status: "ok" }),
}));

vi.mock("child_process", () => ({
  execFile: vi.fn(),
}));

describe("SessionManager Lifecycle & Hardening", () => {
  let sessionManager;

  beforeEach(() => {
    sessionManager = new SessionManager({
      exeDir: "C:\\ProgramData\\SentrixAgent",
      logger: () => {},
    });
  });

  afterEach(() => {
    if (sessionManager.reconciliationTimer) {
      clearInterval(sessionManager.reconciliationTimer);
      sessionManager.reconciliationTimer = null;
    }
  });

  it("initializes with correct default values", () => {
    expect(sessionManager.exeDir).toBe("C:\\ProgramData\\SentrixAgent");
    expect(sessionManager.sessions).toBeInstanceOf(Map);
    expect(sessionManager.isRunning).toBe(false);
    expect(sessionManager.shutdownDiscoveryFailed).toBe(false);
  });

  it("makes failed stop() retryable by clearing stopPromise in finally", async () => {
    sessionManager.isRunning = true;
    vi.spyOn(sessionManager, "findHelperProcesses").mockResolvedValue({
      success: false,
      error: "Discovery timeout"
    });

    const result1 = await sessionManager.stop();
    expect(result1.success).toBe(false);
    expect(sessionManager.stopPromise).toBeNull();

    const result2 = await sessionManager.stop();
    expect(result2.success).toBe(false);
  });

  it("retains disconnected sessions (state 4) and does not launch replacement", async () => {
    sessionManager.isRunning = true;
    vi.spyOn(sessionManager, "getActiveSessions").mockResolvedValue({
      success: true,
      sessions: [{ SessionId: 2, State: 4 }] // WTSDisconnected
    });
    vi.spyOn(sessionManager, "findHelperProcesses").mockResolvedValue({
      success: true,
      processes: []
    });
    const launchSpy = vi.spyOn(sessionManager, "launchHelperForSession");

    await sessionManager.reconcileSessions();

    expect(sessionManager.sessions.has(2)).toBe(true);
    expect(launchSpy).not.toHaveBeenCalled();
  });

  it("distinguishes process discovery failure during health check without destructive cleanup", async () => {
    const record = { sessionId: 1, port: 4201, helperPid: 1234, helperCreationDate: "20261106" };
    sessionManager.sessions.set(1, record);

    vi.spyOn(sessionManager, "isProcessAlive").mockReturnValue(true);
    vi.spyOn(sessionManager, "findHelperProcesses").mockResolvedValue({
      success: false,
      error: "WMI query failed"
    });

    const healthRes = await sessionManager.verifyHelperHealth(1234, 1, 4201, "20261106");
    expect(healthRes.healthy).toBe(false);
    expect(healthRes.discoveryFailed).toBe(true);
  });

  it("resets record to Discovered and clears stale PID on creation-time mismatch (PID reuse protection)", async () => {
    const record = {
      sessionId: 1,
      port: 4201,
      helperPid: 1234,
      helperCreationDate: "20261106000000.000000+000",
      unresolvedHelpers: new Map([[1234, { pid: 1234, sessionId: 1, creationDate: "20261106000000.000000+000" }]])
    };

    vi.spyOn(sessionManager, "findHelperProcesses").mockResolvedValue({
      success: true,
      processes: [
        { ProcessId: 1234, SessionId: 1, ExecutablePath: sessionManager.helperExePath, CreationDate: "20261106120000.000000+000" }
      ]
    });

    await sessionManager.terminateHelperRecord(record, 1234);
    expect(record.state).toBe("Discovered");
    expect(record.helperPid).toBeNull();
    expect(record.unresolvedHelpers.has(1234)).toBe(false);
  });

  it("retains unresolved state and blocks launch when cleanup discovery fails", async () => {
    sessionManager.isRunning = true;
    const record = {
      sessionId: 1,
      port: 4201,
      state: "Unresolved",
      cleanupDiscoveryFailed: true,
      helperPid: null,
      unresolvedHelpers: new Map(),
      restartCount: 0,
      lastAttempt: 0
    };
    sessionManager.sessions.set(1, record);

    vi.spyOn(sessionManager, "getActiveSessions").mockResolvedValue({
      success: true,
      sessions: [{ SessionId: 1, State: 0 }]
    });
    vi.spyOn(sessionManager, "findHelperProcesses").mockResolvedValue({
      success: false,
      error: "Discovery failed"
    });
    const launchSpy = vi.spyOn(sessionManager, "launchHelperForSession");

    await sessionManager.reconcileSessions();

    expect(record.cleanupDiscoveryFailed).toBe(true);
    expect(launchSpy).not.toHaveBeenCalled();
  });

  it("clears cleanup uncertainty when later discovery confirms zero matching helpers", async () => {
    sessionManager.isRunning = true;
    const record = {
      sessionId: 1,
      port: 4201,
      state: "Unresolved",
      cleanupDiscoveryFailed: true,
      helperPid: 999,
      unresolvedHelpers: new Map([[999, { pid: 999, sessionId: 1, creationDate: null }]]),
      restartCount: 0,
      lastAttempt: 0
    };
    sessionManager.sessions.set(1, record);

    vi.spyOn(sessionManager, "getActiveSessions").mockResolvedValue({
      success: true,
      sessions: [{ SessionId: 1, State: 0 }]
    });
    vi.spyOn(sessionManager, "findHelperProcesses").mockResolvedValue({
      success: true,
      processes: []
    });
    vi.spyOn(sessionManager, "launchHelperForSession").mockResolvedValue();

    await sessionManager.reconcileSessions();

    expect(record.cleanupDiscoveryFailed).toBe(false);
    expect(record.state).toBe("Discovered");
    expect(record.helperPid).toBeNull();
    expect(record.unresolvedHelpers.size).toBe(0);
  });

  it("attempts cleanup and blocks premature launch when discovery finds matching helpers during uncertainty recovery", async () => {
    sessionManager.isRunning = true;
    const record = {
      sessionId: 1,
      port: 4201,
      state: "Unresolved",
      cleanupDiscoveryFailed: true,
      helperPid: null,
      unresolvedHelpers: new Map(),
      restartCount: 0,
      lastAttempt: 0
    };
    sessionManager.sessions.set(1, record);

    vi.spyOn(sessionManager, "getActiveSessions").mockResolvedValue({
      success: true,
      sessions: [{ SessionId: 1, State: 0 }]
    });
    vi.spyOn(sessionManager, "findHelperProcesses").mockResolvedValue({
      success: true,
      processes: [
        { ProcessId: 5678, SessionId: 1, ExecutablePath: sessionManager.helperExePath, CreationDate: "20261106" }
      ]
    });
    vi.spyOn(sessionManager, "isProcessAlive").mockReturnValue(true);
    const terminateSpy = vi.spyOn(sessionManager, "terminateHelperRecord").mockImplementation(async (rec, _pid) => {
      rec.state = "Unresolved";
    });
    const launchSpy = vi.spyOn(sessionManager, "launchHelperForSession");

    await sessionManager.reconcileSessions();

    expect(terminateSpy).toHaveBeenCalled();
    expect(record.state).toBe("Unresolved");
    expect(launchSpy).not.toHaveBeenCalled();
  });

  it("blocks start() when shutdown discovery previously failed", async () => {
    sessionManager.shutdownDiscoveryFailed = true;
    vi.spyOn(sessionManager, "findHelperProcesses").mockResolvedValue({
      success: false,
      error: "Discovery failed"
    });

    const startRes = await sessionManager.start();
    expect(startRes.success).toBe(false);
    expect(startRes.error).toContain("Shutdown discovery uncertainty");
  });

  it("allows start() after subsequent discovery succeeds and shutdown uncertainty clears", async () => {
    sessionManager.shutdownDiscoveryFailed = true;
    sessionManager.isRunning = true;

    vi.spyOn(sessionManager, "getActiveSessions").mockResolvedValue({
      success: true,
      sessions: []
    });
    vi.spyOn(sessionManager, "findHelperProcesses").mockResolvedValue({
      success: true,
      processes: []
    });

    await sessionManager.reconcileSessions();
    expect(sessionManager.shutdownDiscoveryFailed).toBe(false);

    sessionManager.isRunning = false;
    const startRes = await sessionManager.start();
    expect(startRes.success).toBe(true);
    expect(sessionManager.isRunning).toBe(true);
    await sessionManager.stop();
  });

  it("keeps start() blocked when stop() fails due to un-terminable helper", async () => {
    sessionManager.isRunning = true;
    vi.spyOn(sessionManager, "findHelperProcesses").mockResolvedValue({
      success: true,
      processes: [
        { ProcessId: 1111, SessionId: 1, ExecutablePath: sessionManager.helperExePath, CreationDate: "20261106" }
      ]
    });
    vi.spyOn(sessionManager, "isProcessAlive").mockReturnValue(true);
    vi.spyOn(sessionManager, "terminateHelperRecord").mockImplementation(async (rec, pid) => {
      rec.state = "Unresolved";
      if (!rec.unresolvedHelpers) rec.unresolvedHelpers = new Map();
      rec.unresolvedHelpers.set(pid, { pid, sessionId: 1, creationDate: "20261106" });
    });

    const stopRes = await sessionManager.stop();
    expect(stopRes.success).toBe(false);
    expect(sessionManager.shutdownDiscoveryFailed).toBe(true);

    const startRes = await sessionManager.start();
    expect(startRes.success).toBe(false);
  });

  it("removes successfully terminated PID from owning session record unresolvedHelpers map", async () => {
    const record = {
      sessionId: 1,
      port: 4201,
      helperPid: 2222,
      helperCreationDate: "20261106",
      unresolvedHelpers: new Map([[2222, { pid: 2222, sessionId: 1, creationDate: "20261106" }]])
    };

    vi.spyOn(sessionManager, "findHelperProcesses").mockResolvedValue({
      success: true,
      processes: [
        { ProcessId: 2222, SessionId: 1, ExecutablePath: sessionManager.helperExePath, CreationDate: "20261106" }
      ]
    });
    vi.spyOn(sessionManager, "isProcessAlive").mockImplementationOnce(() => true).mockImplementationOnce(() => false);

    await sessionManager.terminateHelperRecord(record, 2222);

    expect(record.unresolvedHelpers.has(2222)).toBe(false);
    expect(record.helperPid).toBeNull();
  });

  it("keeps PID in unresolvedHelpers map when termination cannot be confirmed (with isolated executeKill mock)", async () => {
    const record = {
      sessionId: 1,
      port: 4201,
      helperPid: 3333,
      helperCreationDate: "20261106",
      unresolvedHelpers: new Map([[3333, { pid: 3333, sessionId: 1, creationDate: "20261106" }]])
    };

    vi.spyOn(sessionManager, "findHelperProcesses").mockResolvedValue({
      success: true,
      processes: [
        { ProcessId: 3333, SessionId: 1, ExecutablePath: sessionManager.helperExePath, CreationDate: "20261106" }
      ]
    });
    vi.spyOn(sessionManager, "isProcessAlive").mockReturnValue(true);
    const killSpy = vi.spyOn(sessionManager, "executeKill").mockResolvedValue();

    await sessionManager.terminateHelperRecord(record, 3333);

    expect(killSpy).toHaveBeenCalledWith(3333);
    expect(record.unresolvedHelpers.has(3333)).toBe(true);
    expect(record.state).toBe("Unresolved");
  }, 10000);

  it("recovers from shutdownDiscoveryFailed via stopped-manager recoverShutdownUncertainty() when discovery succeeds and helpers exit", async () => {
    sessionManager.shutdownDiscoveryFailed = true;
    vi.spyOn(sessionManager, "findHelperProcesses").mockResolvedValue({
      success: true,
      processes: [
        { ProcessId: 4444, SessionId: 1, ExecutablePath: sessionManager.helperExePath, CreationDate: "20261106" }
      ]
    });
    vi.spyOn(sessionManager, "isProcessAlive").mockImplementationOnce(() => true).mockImplementationOnce(() => false);

    const recoveryRes = await sessionManager.recoverShutdownUncertainty();
    expect(recoveryRes.success).toBe(true);
    expect(sessionManager.shutdownDiscoveryFailed).toBe(false);

    // Verify start() now succeeds
    vi.spyOn(sessionManager, "getActiveSessions").mockResolvedValue({ success: true, sessions: [] });
    const startRes = await sessionManager.start();
    expect(startRes.success).toBe(true);
    expect(sessionManager.isRunning).toBe(true);
    await sessionManager.stop();
  });

  it("awaits active stopPromise in start() using a deferred promise before initializing", async () => {
    let resolveStop;
    const deferredStop = new Promise((r) => { resolveStop = r; });
    sessionManager.stopPromise = deferredStop;

    vi.spyOn(sessionManager, "findHelperProcesses").mockResolvedValue({ success: true, processes: [] });
    vi.spyOn(sessionManager, "getActiveSessions").mockResolvedValue({ success: true, sessions: [] });

    let started = false;
    const startPromise = sessionManager.start().then((res) => {
      started = true;
      return res;
    });

    // Yield control to let start() run up to await stopPromise
    await new Promise((r) => setTimeout(r, 50));
    expect(started).toBe(false);

    resolveStop();
    const startRes = await startPromise;
    expect(startRes.success).toBe(true);
    expect(sessionManager.isRunning).toBe(true);
    await sessionManager.stop();
  });

  it("clears stale references and cleanupDiscoveryFailed for empty session A while terminating active helper for session B during recovery", async () => {
    sessionManager.shutdownDiscoveryFailed = true;
    const sessionA = 1;
    const sessionARecord = {
      sessionId: sessionA,
      port: 4201,
      state: "Unresolved",
      cleanupDiscoveryFailed: true,
      helperPid: 999,
      helperCreationDate: "20261106-stale",
      unresolvedHelpers: new Map([[999, { pid: 999, sessionId: sessionA, creationDate: "20261106-stale" }]])
    };
    sessionManager.sessions.set(sessionA, sessionARecord);

    vi.spyOn(sessionManager, "findHelperProcesses").mockResolvedValue({
      success: true,
      processes: [
        { ProcessId: 5555, SessionId: 2, ExecutablePath: sessionManager.helperExePath, CreationDate: "20261106" }
      ]
    });
    vi.spyOn(sessionManager, "isProcessAlive").mockImplementation((pid) => pid === 5555);
    const terminateSpy = vi.spyOn(sessionManager, "terminateHelperRecord").mockImplementation(async (rec, pid) => {
      if (pid === 5555) {
        rec.helperPid = null;
        rec.unresolvedHelpers?.delete(pid);
        rec.state = "Discovered";
      }
    });

    const recoveryRes = await sessionManager.recoverShutdownUncertainty();

    expect(recoveryRes.success).toBe(true);
    expect(sessionManager.shutdownDiscoveryFailed).toBe(false);
    expect(sessionManager.sessions.get(sessionA).cleanupDiscoveryFailed).toBe(false);
    expect(sessionManager.sessions.get(sessionA).helperPid).toBeNull();
    expect(sessionManager.sessions.get(sessionA).unresolvedHelpers.size).toBe(0);
    expect(sessionManager.sessions.get(sessionA).state).toBe("Discovered");

    expect(terminateSpy).toHaveBeenCalledTimes(1);
    const [sessionBRecord, terminatedPid] = terminateSpy.mock.calls[0];
    expect(sessionBRecord.sessionId).toBe(2);
    expect(terminatedPid).toBe(5555);
    expect(sessionBRecord.helperCreationDate).toBe("20261106");
  });

  it("does not terminate helper for sessions in unsupported or transitional WTS states", async () => {
    sessionManager.isRunning = true;
    const transitionalSessionId = 5;
    const record = {
      sessionId: transitionalSessionId,
      port: 4205,
      state: "Running",
      helperPid: 7777,
      helperCreationDate: "20261106",
      unresolvedHelpers: new Map()
    };
    sessionManager.sessions.set(transitionalSessionId, record);

    vi.spyOn(sessionManager, "getActiveSessions").mockResolvedValue({
      success: true,
      sessions: [{ SessionId: transitionalSessionId, State: 2 }] // State 2 = transitional/unsupported WTSConnectQuery
    });
    vi.spyOn(sessionManager, "findHelperProcesses").mockResolvedValue({
      success: true,
      processes: [
        { ProcessId: 7777, SessionId: transitionalSessionId, ExecutablePath: sessionManager.helperExePath, CreationDate: "20261106" }
      ]
    });
    const terminateSpy = vi.spyOn(sessionManager, "terminateHelperRecord");

    await sessionManager.reconcileSessions();

    // Verify that terminateHelperRecord was NOT called for this helper (it should not be treated as logged off)
    expect(terminateSpy).not.toHaveBeenCalled();
    expect(sessionManager.sessions.has(transitionalSessionId)).toBe(true);
  });

  it("skips Session 0 and processes SessionId > 0 without error in getActiveSessions", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.mocked(execFile).mockImplementation((_cmd, _args, _opts, cb) => {
      const callback = typeof _opts === "function" ? _opts : cb;
      if (typeof callback === "function") {
        callback(null, { stdout: JSON.stringify([{ SessionId: 0, State: 4 }, { SessionId: 1, State: 0 }]), stderr: "" });
      }
    });

    const res = await sessionManager.getActiveSessions();
    expect(res.success).toBe(true);
    expect(res.sessions).toEqual([{ SessionId: 1, State: 0 }]);
  });
});
