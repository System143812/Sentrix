import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";
import { sendMessage } from "../utils/ipc.js";

const execFileAsync = promisify(execFile);

let activeSessionManagerInstance = null;
export function getActiveSessionManager() {
  return activeSessionManagerInstance;
}

export class SessionManager {
  constructor({ exeDir, helperExeName = "sentrix-helper.exe", logger = console.log }) {
    this.exeDir = exeDir;
    this.helperExePath = path.join(exeDir, helperExeName);

    const launcherCandidates = [
      path.join(exeDir, "src", "utils", "SessionLauncher.exe"),
      path.join(exeDir, "SessionLauncher.exe")
    ];
    this.launcherExePath = launcherCandidates.find(p => fs.existsSync(p)) || launcherCandidates[0];

    const getSessionsCandidates = [
      path.join(exeDir, "src", "utils", "get-sessions.ps1"),
      path.join(exeDir, "get-sessions.ps1")
    ];
    this.getSessionsScript = getSessionsCandidates.find(p => fs.existsSync(p)) || getSessionsCandidates[0];

    const findHelperCandidates = [
      path.join(exeDir, "src", "utils", "find-helper.ps1"),
      path.join(exeDir, "find-helper.ps1")
    ];
    this.findHelperScript = findHelperCandidates.find(p => fs.existsSync(p)) || findHelperCandidates[0];

    this.logger = logger;
    this.sessions = new Map(); // sessionId -> sessionRecord
    this.reconciliationTimer = null;
    this.isRunning = false;
    this.activeReconciliationPromise = null;
    this.activeRecoveryPromise = null;
    this.stopPromise = null;
    this.shutdownDiscoveryFailed = false; // Persistent manager-level shutdown uncertainty state
    activeSessionManagerInstance = this;
  }

  async initialize() {
    this.logger("[SessionManager] Initializing session manager...");
    if (!fs.existsSync(this.launcherExePath)) {
      throw new Error(`[SessionManager] FATAL: Required SessionLauncher.exe not found at ${this.launcherExePath}. It must be packaged with the Agent.`);
    }
    if (!fs.existsSync(this.getSessionsScript)) {
      throw new Error(`[SessionManager] FATAL: Required get-sessions.ps1 script not found at ${this.getSessionsScript}.`);
    }
    if (!fs.existsSync(this.findHelperScript)) {
      throw new Error(`[SessionManager] FATAL: Required find-helper.ps1 script not found at ${this.findHelperScript}.`);
    }
    if (!fs.existsSync(this.helperExePath)) {
      this.logger(`[SessionManager] WARNING: Helper executable not found at ${this.helperExePath} during initialization.`);
    }
  }

  async recoverShutdownUncertainty() {
    if (!this.shutdownDiscoveryFailed) return { success: true };
    if (this.activeRecoveryPromise) {
      return this.activeRecoveryPromise;
    }

    this.activeRecoveryPromise = (async () => {
      try {
        this.logger("[SessionManager] Running stopped-manager recovery to clear shutdown uncertainty...");
        const discResult = await this.findHelperProcesses();
        if (!discResult.success) {
          this.logger(`[SessionManager] Recovery discovery failed: ${discResult.error}`);
          return { success: false, error: discResult.error };
        }

        const expectedNorm = this.normalizePath(this.helperExePath);
        const matchingProcesses = discResult.processes.filter(
          (p) => Number.isSafeInteger(p.ProcessId) && p.ProcessId > 0 &&
                 Number.isSafeInteger(p.SessionId) && p.SessionId > 0 &&
                 p.ExecutablePath && this.normalizePath(p.ExecutablePath) === expectedNorm
        );

        // Reconcile existing tracked references against the fresh discovery snapshot
        // to clear out stale unresolved PIDs that are no longer running/matching helpers.
        const activeMatchingMap = new Map(); // "${sessionId}:${pid}" -> process info
        for (const mp of matchingProcesses) {
          activeMatchingMap.set(`${Number(mp.SessionId)}:${Number(mp.ProcessId)}`, mp);
        }

        for (const [sid, rec] of this.sessions.entries()) {
          const hasMatchingHelper = matchingProcesses.some(
            (p) => Number(p.SessionId) === Number(sid)
          );

          if (rec.helperPid) {
            const key = `${sid}:${rec.helperPid}`;
            if (!activeMatchingMap.has(key)) {
              rec.helperPid = null;
              rec.helperCreationDate = null;
            }
          }
          if (rec.unresolvedHelpers instanceof Map) {
            for (const pid of [...rec.unresolvedHelpers.keys()]) {
              const key = `${sid}:${pid}`;
              if (!activeMatchingMap.has(key)) {
                rec.unresolvedHelpers.delete(pid);
              }
            }
          }

          // Successful complete discovery resolves prior discovery uncertainty
          // for sessions with no matching Helper.
          if (!hasMatchingHelper) {
            rec.cleanupDiscoveryFailed = false;
          }

          if (rec.state === "Unresolved" && !rec.helperPid && (!rec.unresolvedHelpers || rec.unresolvedHelpers.size === 0) && !rec.cleanupDiscoveryFailed) {
            rec.state = "Discovered";
          }
        }

        if (matchingProcesses.length === 0) {
          this.logger("[SessionManager] Recovery discovery confirms zero matching helpers. Clearing shutdown uncertainty.");
          this.shutdownDiscoveryFailed = false;
          for (const rec of this.sessions.values()) {
            rec.helperPid = null;
            rec.helperCreationDate = null;
            rec.unresolvedHelpers?.clear();
            rec.cleanupDiscoveryFailed = false;
            if (rec.state === "Unresolved") {
              rec.state = "Discovered";
            }
          }
          return { success: true };
        }

        // Resolve any discovered helpers (including orphans not in this.sessions)
        let allTerminated = true;
        for (const p of matchingProcesses) {
          const pid = Number(p.ProcessId);
          const sid = Number(p.SessionId);
          const creationDate = p.CreationDate || null;
          const port = 4200 + sid;

          let record = this.sessions.get(sid);
          if (!record) {
            record = {
              sessionId: sid,
              port,
              state: "Unresolved",
              helperPid: pid,
              helperCreationDate: creationDate,
              unresolvedHelpers: new Map([[pid, { pid, sessionId: sid, creationDate }]]),
              cleanupDiscoveryFailed: false,
              restartCount: 0,
              lastAttempt: 0
            };
            this.sessions.set(sid, record);
          } else {
            if (!record.unresolvedHelpers) record.unresolvedHelpers = new Map();
            record.unresolvedHelpers.set(pid, { pid, sessionId: sid, creationDate });
            record.helperPid = pid;
            record.helperCreationDate = creationDate;
          }

          await this.terminateHelperRecord(record, pid);
          if (record.helperPid || (record.unresolvedHelpers && record.unresolvedHelpers.size > 0)) {
            allTerminated = false;
          }
        }

        // Verify that no session record remains Unresolved, has cleanupDiscoveryFailed, or has remaining unresolvedHelpers
        let anyUnresolvedRemains = false;
        for (const rec of this.sessions.values()) {
          if (rec.state === "Unresolved" || rec.cleanupDiscoveryFailed || (rec.unresolvedHelpers && rec.unresolvedHelpers.size > 0)) {
            anyUnresolvedRemains = true;
            break;
          }
        }

        if (allTerminated && !anyUnresolvedRemains) {
          this.shutdownDiscoveryFailed = false;
          this.logger("[SessionManager] All shutdown uncertainty helpers successfully resolved and terminated. Clearing shutdownDiscoveryFailed.");
          return { success: true };
        } else {
          this.logger("[SessionManager] WARNING: Some shutdown uncertainty helpers or session records remain unresolved. Retaining shutdownDiscoveryFailed.");
          return { success: false, error: "Unresolved helpers remain during recovery" };
        }
      } finally {
        this.activeRecoveryPromise = null;
      }
    })();

    return this.activeRecoveryPromise;
  }

  async start() {
    // 1. Await in-flight stopPromise if any before attempting recovery or starting
    if (this.stopPromise) {
      this.logger("[SessionManager] Waiting for ongoing stop() before starting...");
      try {
        await this.stopPromise;
      } catch {}
      this.stopPromise = null;
    }

    // 2. Attempt recovery if manager-level shutdown uncertainty is set
    if (this.shutdownDiscoveryFailed) {
      await this.recoverShutdownUncertainty();
    }

    // 3. Check manager-level shutdown uncertainty state
    if (this.shutdownDiscoveryFailed) {
      this.logger("[SessionManager] Refusing to start: shutdown discovery uncertainty remains unresolved.");
      return { success: false, error: "Shutdown discovery uncertainty remains unresolved" };
    }

    // 4. Check persistent session records for unresolved helpers, cleanup discovery failure, or active state before starting
    for (const [sid, rec] of this.sessions.entries()) {
      if (rec.state === "Unresolved" || rec.cleanupDiscoveryFailed || (rec.unresolvedHelpers && rec.unresolvedHelpers.size > 0)) {
        this.logger(`[SessionManager] Refusing to start: session ${sid} has unresolved helpers or cleanup discovery failure.`);
        return { success: false, error: "Previous session state contains unresolved helpers or cleanup discovery failure" };
      }
    }

    if (this.isRunning) return { success: true };
    this.isRunning = true;
    this.stopPromise = null;

    this.logger("[SessionManager] Starting session monitoring and reconciliation loop...");
    this.reconcileSessions().catch((err) => {
      this.logger(`[SessionManager] Error during initial reconciliation: ${err.message}`);
    });

    this.reconciliationTimer = setInterval(async () => {
      try {
        await this.reconcileSessions();
      } catch (err) {
        this.logger(`[SessionManager] Error in reconciliation loop: ${err.message}`);
      }
    }, 45000);

    return { success: true };
  }

  async stop() {
    if (this.stopPromise) {
      return this.stopPromise;
    }

    this.stopPromise = (async () => {
      try {
        this.logger("[SessionManager] Stopping session manager and notifying active helpers...");
        this.isRunning = false;

        if (this.reconciliationTimer) {
          clearInterval(this.reconciliationTimer);
          this.reconciliationTimer = null;
        }

        // Await active reconciliation cycle if any
        if (this.activeReconciliationPromise) {
          try {
            await this.activeReconciliationPromise;
          } catch {}
        }

        let discoveryFailedDuringStop = false;
        // Use string keys "${sessionId}:${pid}" for robust deduplication
        const allDiscoveredTargets = new Map(); // key -> { pid, sessionId, creationDate }
        const discResult = await this.findHelperProcesses();

        if (!discResult.success) {
          this.logger(`[SessionManager] WARNING: Process discovery failed during shutdown: ${discResult.error}`);
          discoveryFailedDuringStop = true;
          this.shutdownDiscoveryFailed = true;
        } else {
          const expectedNorm = this.normalizePath(this.helperExePath);
          for (const p of discResult.processes) {
            const pid = Number(p.ProcessId);
            const sid = Number(p.SessionId);
            const pExe = p.ExecutablePath;
            const creationDate = p.CreationDate || null;
            if (Number.isSafeInteger(pid) && pid > 0 && Number.isSafeInteger(sid) && sid > 0 && pExe && this.normalizePath(pExe) === expectedNorm) {
              const key = `${sid}:${pid}`;
              allDiscoveredTargets.set(key, { pid, sessionId: sid, creationDate });

              let record = this.sessions.get(sid);
              if (!record) {
                const port = 4200 + sid;
                record = {
                  sessionId: sid,
                  port,
                  state: "Discovered",
                  helperPid: pid,
                  helperCreationDate: creationDate,
                  unresolvedHelpers: new Map([[pid, { pid, sessionId: sid, creationDate }]]),
                  cleanupDiscoveryFailed: false,
                  restartCount: 0,
                  lastAttempt: 0
                };
                this.sessions.set(sid, record);
              } else {
                if (!record.unresolvedHelpers) record.unresolvedHelpers = new Map();
                record.unresolvedHelpers.set(pid, { pid, sessionId: sid, creationDate });
                if (!record.helperPid) {
                  record.helperPid = pid;
                  record.helperCreationDate = creationDate;
                }
              }
            }
          }
          this.shutdownDiscoveryFailed = false;
        }

        // Also ensure any currently tracked unresolvedHelpers or helperPids are in our shutdown set with sessionId preserved
        for (const [sessionId, record] of this.sessions.entries()) {
          if (record.unresolvedHelpers instanceof Map) {
            for (const [pid, info] of record.unresolvedHelpers.entries()) {
              allDiscoveredTargets.set(`${sessionId}:${pid}`, { ...info, pid, sessionId });
            }
          }
          if (record.helperPid) {
            allDiscoveredTargets.set(`${sessionId}:${record.helperPid}`, {
              pid: record.helperPid,
              sessionId,
              creationDate: record.helperCreationDate || null
            });
          }
        }

        const unresolvedPids = [];
        let allTerminated = !discoveryFailedDuringStop;

        // Terminate every discovered/tracked candidate PID across all sessions
        for (const target of allDiscoveredTargets.values()) {
          const { pid, sessionId, creationDate } = target;
          const port = 4200 + sessionId;
          let record = this.sessions.get(sessionId);
          if (!record) {
            record = {
              sessionId,
              port,
              state: "Discovered",
              helperPid: pid,
              helperCreationDate: creationDate,
              unresolvedHelpers: new Map([[pid, { pid, sessionId, creationDate }]]),
              cleanupDiscoveryFailed: false,
              restartCount: 0,
              lastAttempt: 0
            };
            this.sessions.set(sessionId, record);
          }
          await this.terminateHelperRecord(record, pid);

          if (record.unresolvedHelpers && record.unresolvedHelpers.has(pid)) {
            allTerminated = false;
            unresolvedPids.push(pid);
            record.state = "Unresolved";
          }
        }

        // Clean up session records whose helpers have all exited
        for (const [sessionId, record] of this.sessions.entries()) {
          const hasUnresolved = (record.unresolvedHelpers && record.unresolvedHelpers.size > 0) || record.helperPid || record.cleanupDiscoveryFailed;
          if (!hasUnresolved) {
            this.sessions.delete(sessionId);
          } else {
            allTerminated = false;
            if (record.helperPid && !unresolvedPids.includes(record.helperPid)) {
              unresolvedPids.push(record.helperPid);
            }
            if (record.unresolvedHelpers) {
              for (const pid of record.unresolvedHelpers.keys()) {
                if (!unresolvedPids.includes(pid)) unresolvedPids.push(pid);
              }
            }
          }
        }

        const success = allTerminated && !discoveryFailedDuringStop && unresolvedPids.length === 0;
        if (success) {
          this.shutdownDiscoveryFailed = false;
          this.logger("[SessionManager] Session manager stopped successfully. All helpers confirmed exited.");
        } else {
          this.shutdownDiscoveryFailed = true;
          this.logger(`[SessionManager] WARNING: Session manager stopped with incomplete shutdown. Unresolved PIDs: [${unresolvedPids.join(", ")}], DiscoveryFailed: ${discoveryFailedDuringStop}`);
        }

        if (activeSessionManagerInstance === this) {
          activeSessionManagerInstance = null;
        }

        return {
          success,
          unresolvedPids,
          discoveryFailed: discoveryFailedDuringStop,
        };
      } finally {
        this.stopPromise = null;
      }
    })();

    return this.stopPromise;
  }

  getActiveHelperEndpoints() {
    const endpoints = [];
    for (const [sessionId, record] of this.sessions.entries()) {
      if (record.state === "Running" && record.helperPid && Number.isSafeInteger(record.port)) {
        endpoints.push({
          sessionId: Number(sessionId),
          port: Number(record.port),
          pid: Number(record.helperPid)
        });
      }
    }
    return endpoints;
  }

  async getActiveSessions() {
    try {
      const scriptPath = this.getSessionsScript;
      if (!fs.existsSync(scriptPath)) {
        return { success: false, error: "get-sessions.ps1 script not found" };
      }

      const { stdout } = await execFileAsync("powershell.exe", [
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-File", scriptPath
      ], { maxBuffer: 1024 * 1024, timeout: 15000 });

      const trimmed = stdout.trim();
      if (!trimmed) return { success: true, sessions: [] };
      const parsed = JSON.parse(trimmed);
      const rawList = Array.isArray(parsed) ? parsed : [parsed];

      const sessions = [];
      for (const item of rawList) {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
          return { success: false, error: "Malformed session record: not a plain object" };
        }
        const sid = Number(item.SessionId);
        const state = Number(item.State);
        if (!Number.isSafeInteger(sid) || sid < 0 || !Number.isSafeInteger(state)) {
          return { success: false, error: `Malformed session record fields: SessionId=${item.SessionId}, State=${item.State}` };
        }
        if (sid === 0) {
          continue;
        }
        sessions.push({ SessionId: sid, State: state });
      }
      return { success: true, sessions };
    } catch (err) {
      this.logger(`[SessionManager] Failed to enumerate Windows sessions: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  async reconcileSessions() {
    if (!this.isRunning) return;
    if (this.activeReconciliationPromise) {
      return this.activeReconciliationPromise;
    }

    this.activeReconciliationPromise = (async () => {
      try {
        const enumResult = await this.getActiveSessions();
        if (!this.isRunning) return;

        if (!enumResult.success) {
          this.logger(`[SessionManager] Aborting reconciliation cycle due to session enumeration failure: ${enumResult.error}`);
          return;
        }

        const rawSessions = enumResult.sessions;
        const activeSessionIds = new Set();

        let discResult = await this.findHelperProcesses();
        if (!this.isRunning) return;
        if (!discResult.success) {
          this.logger(`[SessionManager] Aborting reconciliation cycle due to process discovery failure: ${discResult.error}`);
          this.shutdownDiscoveryFailed = true;
          return;
        }

        const expectedNorm = this.normalizePath(this.helperExePath);

        // Check for any orphaned/unmanaged helper processes across the system not tied to active sessions
        const activeSessionSet = new Set(rawSessions.map(s => Number(s.SessionId)));
        const orphanedHelpers = discResult.processes.filter(
          (p) => Number.isSafeInteger(p.ProcessId) && p.ProcessId > 0 &&
                 Number.isSafeInteger(p.SessionId) && p.SessionId > 0 &&
                 !activeSessionSet.has(Number(p.SessionId)) &&
                 p.ExecutablePath && this.normalizePath(p.ExecutablePath) === expectedNorm
        );

        let allOrphansResolved = true;
        for (const orphan of orphanedHelpers) {
          const pid = Number(orphan.ProcessId);
          const sid = Number(orphan.SessionId);
          const creationDate = orphan.CreationDate || null;
          let record = this.sessions.get(sid);
          if (!record) {
            record = {
              sessionId: sid,
              port: 4200 + sid,
              state: "Unresolved",
              helperPid: pid,
              helperCreationDate: creationDate,
              unresolvedHelpers: new Map([[pid, { pid, sessionId: sid, creationDate }]]),
              cleanupDiscoveryFailed: false,
              restartCount: 0,
              lastAttempt: 0
            };
            this.sessions.set(sid, record);
          } else {
            if (!record.unresolvedHelpers) record.unresolvedHelpers = new Map();
            record.unresolvedHelpers.set(pid, { pid, sessionId: sid, creationDate });
            record.helperPid = pid;
            record.helperCreationDate = creationDate;
          }
          await this.terminateHelperRecord(record, pid);
          if (record.helperPid || (record.unresolvedHelpers && record.unresolvedHelpers.size > 0)) {
            allOrphansResolved = false;
          }
        }

        // Refresh discovery snapshot after orphan cleanup to prevent stale process inspection
        const refreshedDisc = await this.findHelperProcesses();
        if (!refreshedDisc.success) {
          this.logger(`[SessionManager] Aborting reconciliation cycle because refreshed process discovery failed: ${refreshedDisc.error}`);
          this.shutdownDiscoveryFailed = true;
          return;
        }
        discResult = refreshedDisc;

        for (const raw of rawSessions) {
          if (!this.isRunning) break;
          const sessionId = Number(raw.SessionId);
          const state = Number(raw.State);

          activeSessionIds.add(sessionId);

          if (state !== 0 && state !== 1 && state !== 4) continue;

          const port = 4200 + sessionId;
          if (!Number.isSafeInteger(port) || port > 65535) {
            this.logger(`[SessionManager] Skipping session ${sessionId}: calculated IPC port ${port} is invalid.`);
            continue;
          }

          let record = this.sessions.get(sessionId);
          if (!record) {
            record = {
              sessionId,
              port,
              state: "Discovered",
              helperPid: null,
              helperCreationDate: null,
              unresolvedHelpers: new Map(),
              cleanupDiscoveryFailed: false,
              restartCount: 0,
              lastAttempt: 0,
            };
            this.sessions.set(sessionId, record);
          }

          if (!this.isRunning) break;

          // Handle records with cleanupDiscoveryFailed or unresolved helpers
          if (record.state === "Unresolved" || record.cleanupDiscoveryFailed || (record.unresolvedHelpers && record.unresolvedHelpers.size > 0)) {
            this.logger(`[SessionManager] Session ${sessionId} has cleanup uncertainty or unresolved helpers. Re-verifying via successful discovery...`);

            const sessionMatches = discResult.processes.filter(
              (p) => Number(p.SessionId) === Number(sessionId) && Number.isSafeInteger(p.ProcessId) && p.ProcessId > 0 && p.ExecutablePath && this.normalizePath(p.ExecutablePath) === expectedNorm
            );

            if (sessionMatches.length === 0) {
              this.logger(`[SessionManager] Discovery confirms zero matching helpers in session ${sessionId}. Clearing cleanup uncertainty.`);
              record.cleanupDiscoveryFailed = false;
              record.state = "Discovered";
              record.helperPid = null;
              record.helperCreationDate = null;
              if (record.unresolvedHelpers) record.unresolvedHelpers.clear();
            } else {
              this.logger(`[SessionManager] Discovery found ${sessionMatches.length} matching helper(s) in session ${sessionId} during uncertainty recovery. Cleaning up...`);
              let allTerminated = true;
              for (const m of sessionMatches) {
                const pid = Number(m.ProcessId);
                const creationDate = m.CreationDate || null;
                if (!record.unresolvedHelpers) record.unresolvedHelpers = new Map();
                record.unresolvedHelpers.set(pid, { pid, sessionId, creationDate });
                record.helperPid = pid;
                record.helperCreationDate = creationDate;

                await this.terminateHelperRecord(record, pid);
                if (record.unresolvedHelpers && record.unresolvedHelpers.has(pid)) {
                  allTerminated = false;
                }
              }

              if (!allTerminated || record.helperPid || (record.unresolvedHelpers && record.unresolvedHelpers.size > 0)) {
                this.logger(`[SessionManager] ERROR: Cleanup still failing for session ${sessionId}. Retaining Unresolved state.`);
                record.state = "Unresolved";
                continue;
              } else {
                record.cleanupDiscoveryFailed = false;
                record.state = "Discovered";
              }
            }
          }

          // 1. If we don't have a tracked helperPid, check for existing helper in session (adoption / recovery)
          if (!record.helperPid) {
            const matches = discResult.processes.filter(
              (p) =>
                Number(p.SessionId) === Number(sessionId) &&
                Number.isSafeInteger(p.ProcessId) &&
                p.ProcessId > 0 &&
                p.ExecutablePath &&
                this.normalizePath(p.ExecutablePath) === expectedNorm
            );

            if (matches.length === 1) {
              const candidatePid = Number(matches[0].ProcessId);
              const candidateCreation = matches[0].CreationDate || null;
              this.logger(`[SessionManager] Found existing helper in session ${sessionId} (PID ${candidatePid}). Verifying health...`);
              const healthRes = await this.verifyHelperHealth(candidatePid, sessionId, port, candidateCreation);
              if (!this.isRunning) break;
              if (healthRes.discoveryFailed) {
                this.logger(`[SessionManager] WARNING: Process discovery failed during health check for session ${sessionId}. Retrying later.`);
                continue;
              }
              if (healthRes.healthy) {
                record.helperPid = candidatePid;
                record.helperCreationDate = candidateCreation;
                record.state = "Running";
                record.restartCount = 0;
                this.logger(`[SessionManager] Successfully adopted existing healthy helper in session ${sessionId} (PID ${candidatePid}).`);
              } else {
                this.logger(`[SessionManager] Existing helper in session ${sessionId} (PID ${candidatePid}) failed health verification. Cleaning up...`);
                record.helperPid = candidatePid;
                record.helperCreationDate = candidateCreation;
                if (!record.unresolvedHelpers) record.unresolvedHelpers = new Map();
                record.unresolvedHelpers.set(candidatePid, { pid: candidatePid, sessionId, creationDate: candidateCreation });

                await this.terminateHelperRecord(record, candidatePid);
                if (record.helperPid || (record.unresolvedHelpers && record.unresolvedHelpers.size > 0)) {
                  record.state = "Unresolved";
                  continue;
                }
              }
            } else if (matches.length > 1) {
              this.logger(`[SessionManager] WARNING: Multiple matching helpers found in session ${sessionId}. Cleaning up all candidates safely...`);
              let allExited = true;
              for (const m of matches) {
                const multiPid = Number(m.ProcessId);
                const multiCreation = m.CreationDate || null;
                if (!record.unresolvedHelpers) record.unresolvedHelpers = new Map();
                record.unresolvedHelpers.set(multiPid, { pid: multiPid, sessionId, creationDate: multiCreation });
                record.helperPid = multiPid;

                await this.terminateHelperRecord(record, multiPid);
                if (record.unresolvedHelpers && record.unresolvedHelpers.has(multiPid)) {
                  allExited = false;
                }
              }
              if (!allExited) {
                record.state = "Unresolved";
                this.logger(`[SessionManager] ERROR: Not all matching helpers in session ${sessionId} could be terminated. Marking session Unresolved.`);
                continue;
              }
            }
          }

          // 2. Verify currently tracked helper health
          if (record.helperPid) {
            const healthRes = await this.verifyHelperHealth(record.helperPid, sessionId, record.port, record.helperCreationDate);
            if (!this.isRunning) break;
            if (healthRes.discoveryFailed) {
              this.logger(`[SessionManager] WARNING: Process discovery failed during health check for tracked helper in session ${sessionId}. Retrying later.`);
              continue;
            }
            if (!healthRes.healthy) {
              this.logger(`[SessionManager] Helper in session ${sessionId} (PID ${record.helperPid}) failed health check or exited.`);
              await this.terminateHelperRecord(record, record.helperPid);
              if (record.helperPid || (record.unresolvedHelpers && record.unresolvedHelpers.size > 0)) {
                record.state = "Unresolved";
                this.logger(`[SessionManager] ERROR: Helper in session ${sessionId} failed to terminate cleanly. Marking Unresolved.`);
                continue;
              }
              record.state = "Crashed";
            }
          }

          if (!this.isRunning) break;

          // 3. Launch helper if none running and state is fully clean/resolved
          if (!record.helperPid && record.state !== "Launching" && record.state !== "Unresolved" && !record.cleanupDiscoveryFailed && state !== 4) {
            const now = Date.now();
            const backoff = Math.min(Math.pow(2, record.restartCount) * 5000, 60000);
            if (now - record.lastAttempt > backoff) {
              record.lastAttempt = now;
              record.restartCount++;
              await this.launchHelperForSession(record);
            }
          } else if (state === 4 && !record.helperPid) {
            this.logger(`[SessionManager] Session ${sessionId} is disconnected (WTSDisconnected). Retaining record without launching new helper.`);
          }
        }

        // Cleanup sessions that disappeared or logged off entirely
        let allSessionsCleaned = true;
        for (const [sessionId, record] of this.sessions.entries()) {
          if (!this.isRunning) break;
          if (!activeSessionIds.has(sessionId)) {
            this.logger(`[SessionManager] Session ${sessionId} logged off. Cleaning up helper...`);
            if (record.helperPid) {
              await this.terminateHelperRecord(record, record.helperPid);
            }
            if (record.unresolvedHelpers && record.unresolvedHelpers.size > 0) {
              for (const pid of [...record.unresolvedHelpers.keys()]) {
                await this.terminateHelperRecord(record, pid);
              }
            }
            const hasUnresolved = (record.unresolvedHelpers && record.unresolvedHelpers.size > 0) || record.helperPid || record.cleanupDiscoveryFailed;
            if (!hasUnresolved) {
              this.sessions.delete(sessionId);
            } else {
              record.state = "Unresolved";
              allSessionsCleaned = false;
              this.logger(`[SessionManager] WARNING: Retaining record for logged-off session ${sessionId} because helper PIDs failed to terminate.`);
            }
          } else {
            if (record.state === "Unresolved" || record.cleanupDiscoveryFailed || (record.unresolvedHelpers && record.unresolvedHelpers.size > 0) || record.helperPid) {
              const hasUnresolved = (record.unresolvedHelpers && record.unresolvedHelpers.size > 0) || record.cleanupDiscoveryFailed;
              if (hasUnresolved) {
                allSessionsCleaned = false;
              }
            }
          }
        }

        // Only clear shutdownDiscoveryFailed after discovery succeeds AND all orphans/unresolved sessions/helpers are confirmed resolved
        if (allOrphansResolved && allSessionsCleaned) {
          let anyUnresolvedRemains = false;
          for (const rec of this.sessions.values()) {
            if (rec.state === "Unresolved" || rec.cleanupDiscoveryFailed || (rec.unresolvedHelpers && rec.unresolvedHelpers.size > 0)) {
              anyUnresolvedRemains = true;
              break;
            }
          }
          if (!anyUnresolvedRemains) {
            this.shutdownDiscoveryFailed = false;
            this.logger("[SessionManager] Shutdown uncertainty cleared: all discovered helpers and orphans successfully resolved.");
          }
        }
      } finally {
        this.activeReconciliationPromise = null;
      }
    })();

    return this.activeReconciliationPromise;
  }

  isProcessAlive(pid) {
    if (!Number.isSafeInteger(pid) || pid <= 0) return false;
    try {
      process.kill(pid, 0);
      return true;
    } catch (err) {
      if (err.code === "EPERM") return true;
      if (err.code === "ESRCH") return false;
      return true;
    }
  }

  normalizePath(p) {
    if (!p) return "";
    return path.win32.resolve(p).toLowerCase();
  }

  async findHelperProcesses() {
    const scriptPath = this.findHelperScript;
    if (!fs.existsSync(scriptPath)) {
      return { success: false, error: "find-helper.ps1 script not found" };
    }
    try {
      const { stdout } = await execFileAsync("powershell.exe", [
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-File", scriptPath
      ], { encoding: "utf8", timeout: 10000, maxBuffer: 1024 * 1024 });

      const trimmed = stdout.trim();
      if (!trimmed) return { success: true, processes: [] };
      const parsed = JSON.parse(trimmed);
      const rawList = Array.isArray(parsed) ? parsed : [parsed];

      const processes = [];
      for (const item of rawList) {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
          return { success: false, error: "Malformed process record: not a plain object" };
        }
        const pid = Number(item.ProcessId);
        const sid = Number(item.SessionId);
        const pExe = item.ExecutablePath;
        const creationDate = item.CreationDate || null;
        if (!Number.isSafeInteger(pid) || pid <= 0 || !Number.isSafeInteger(sid) || sid <= 0 || typeof pExe !== "string" || !pExe.trim()) {
          return { success: false, error: `Malformed process record fields: ProcessId=${item.ProcessId}, SessionId=${item.SessionId}, ExecutablePath=${item.ExecutablePath}` };
        }
        processes.push({ ProcessId: pid, SessionId: sid, ExecutablePath: pExe.trim(), CreationDate: creationDate });
      }
      return { success: true, processes };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async verifyHelperHealth(pid, expectedSessionId, port, expectedCreationDate = null) {
    if (!Number.isSafeInteger(pid) || pid <= 0) return { healthy: false, discoveryFailed: false };
    if (!this.isProcessAlive(pid)) return { healthy: false, discoveryFailed: false };

    try {
      const disc = await this.findHelperProcesses();
      if (!disc.success) {
        return { healthy: false, discoveryFailed: true };
      }

      const match = disc.processes.find((p) => Number(p.ProcessId) === Number(pid));
      if (!match) return { healthy: false, discoveryFailed: false };

      if (Number(match.SessionId) !== Number(expectedSessionId)) return { healthy: false, discoveryFailed: false };

      const matchedExe = match.ExecutablePath;
      if (!matchedExe || this.normalizePath(matchedExe) !== this.normalizePath(this.helperExePath)) {
        return { healthy: false, discoveryFailed: false };
      }

      if (expectedCreationDate) {
        if (!match.CreationDate || match.CreationDate !== expectedCreationDate) {
          this.logger(`[SessionManager] WARNING: PID ${pid} creation time missing or mismatched (expected ${expectedCreationDate}, found ${match.CreationDate}). Suspected PID reuse!`);
          return { healthy: false, discoveryFailed: false };
        }
      }

      const res = await sendMessage(port, { type: "ping" });
      if (res && res.success && res.type === "pong" && res.status === "ok" && Number(res.pid) === Number(pid)) {
        return { healthy: true, discoveryFailed: false };
      }

      return { healthy: false, discoveryFailed: false };
    } catch {
      return { healthy: false, discoveryFailed: false };
    }
  }

  async launchHelperForSession(record) {
    const { sessionId, port } = record;
    if (!this.isRunning) return;

    if (!fs.existsSync(this.helperExePath)) {
      this.logger(`[SessionManager] Helper executable not found at ${this.helperExePath}`);
      return;
    }

    record.state = "Launching";
    this.logger(`[SessionManager] Launching helper in session ${sessionId} on port ${port}...`);

    try {
      const { stdout } = await execFileAsync(this.launcherExePath, [
        String(sessionId),
        this.helperExePath,
        "--port",
        String(port),
      ], { timeout: 15000 });

      if (!this.isRunning) {
        await this.cleanupSpawnedCandidate(record);
        return;
      }

      this.logger(`[SessionManager] Launcher output: ${stdout.trim()}`);

      await new Promise((r) => setTimeout(r, 1500));
      if (!this.isRunning) {
        await this.cleanupSpawnedCandidate(record);
        return;
      }

      const foundInfo = await this.findHelperInfoForSession(sessionId);
      record.helperPid = foundInfo ? foundInfo.pid : null;
      record.helperCreationDate = foundInfo ? foundInfo.creationDate : null;

      const healthRes = record.helperPid ? await this.verifyHelperHealth(record.helperPid, sessionId, port, record.helperCreationDate) : { healthy: false, discoveryFailed: false };

      if (healthRes.discoveryFailed) {
        this.logger(`[SessionManager] WARNING: Process discovery failed during launch health check for session ${sessionId}. Marking Unresolved with cleanupDiscoveryFailed.`);
        record.state = "Unresolved";
        record.cleanupDiscoveryFailed = true;
        return;
      }

      if (record.helperPid && healthRes.healthy) {
        record.state = "Running";
        record.restartCount = 0;
        record.cleanupDiscoveryFailed = false;
        this.logger(`[SessionManager] Helper successfully launched and verified in session ${sessionId} (PID ${record.helperPid})`);
      } else {
        if (record.helperPid) {
          this.logger(`[SessionManager] Launched helper in session ${sessionId} (PID ${record.helperPid}) failed health verification. Cleaning up...`);
          if (!record.unresolvedHelpers) record.unresolvedHelpers = new Map();
          record.unresolvedHelpers.set(record.helperPid, { pid: record.helperPid, sessionId, creationDate: record.helperCreationDate });

          await this.terminateHelperRecord(record, record.helperPid);
          if (record.helperPid || (record.unresolvedHelpers && record.unresolvedHelpers.size > 0)) {
            record.state = "Unresolved";
          } else {
            record.state = "Failed";
          }
        } else {
          const cleanupRes = await this.cleanupSpawnedCandidate(record);
          if (cleanupRes.status === "discoveryFailed" || cleanupRes.status === "failed") {
            record.state = "Unresolved";
            record.cleanupDiscoveryFailed = true;
            this.logger(`[SessionManager] ERROR: Launcher failed and candidate cleanup incomplete/uncertain for session ${sessionId}. Marking record Unresolved.`);
          } else {
            record.state = "Failed";
          }
        }
      }
    } catch (err) {
      const cleanupRes = await this.cleanupSpawnedCandidate(record);
      if (cleanupRes.status === "discoveryFailed" || cleanupRes.status === "failed") {
        record.state = "Unresolved";
        record.cleanupDiscoveryFailed = true;
        this.logger(`[SessionManager] ERROR: Launcher execution failed and candidate cleanup incomplete/uncertain for session ${sessionId}. Marking record Unresolved.`);
      } else {
        record.state = "Failed";
      }
      this.logger(`[SessionManager] ERROR launching helper for session ${sessionId}: ${err.message}`);
    }
  }

  async cleanupSpawnedCandidate(record) {
    const { sessionId } = record;
    const disc = await this.findHelperProcesses();
    if (!disc.success) {
      record.state = "Unresolved";
      record.cleanupDiscoveryFailed = true;
      return { success: false, status: "discoveryFailed" };
    }

    record.cleanupDiscoveryFailed = false;
    const expectedNorm = this.normalizePath(this.helperExePath);
    const matches = disc.processes.filter(
      (p) =>
        Number(p.SessionId) === Number(sessionId) &&
        Number.isSafeInteger(p.ProcessId) &&
        p.ProcessId > 0 &&
        p.ExecutablePath &&
        this.normalizePath(p.ExecutablePath) === expectedNorm
    );

    if (matches.length === 0) {
      record.helperPid = null;
      record.helperCreationDate = null;
      if (record.unresolvedHelpers) record.unresolvedHelpers.clear();
      if (record.state === "Unresolved") record.state = "Discovered";
      return { success: true, status: "notFound" };
    }

    let allTerminated = true;
    for (const m of matches) {
      const pid = Number(m.ProcessId);
      const creationDate = m.CreationDate || null;
      if (!record.unresolvedHelpers) record.unresolvedHelpers = new Map();
      record.unresolvedHelpers.set(pid, { pid, sessionId, creationDate });
      record.helperPid = pid;
      record.helperCreationDate = creationDate;

      await this.terminateHelperRecord(record, pid);
      if (record.unresolvedHelpers && record.unresolvedHelpers.has(pid)) {
        allTerminated = false;
      }
    }

    if (allTerminated) {
      record.helperPid = null;
      record.helperCreationDate = null;
      if (record.unresolvedHelpers) record.unresolvedHelpers.clear();
      if (record.state === "Unresolved") record.state = "Discovered";
    }

    return { success: allTerminated, status: allTerminated ? "terminated" : "failed" };
  }

  async findHelperInfoForSession(sessionId) {
    try {
      const disc = await this.findHelperProcesses();
      if (!disc.success) return null;

      const matches = disc.processes.filter(
        (p) =>
          Number(p.SessionId) === Number(sessionId) &&
          Number.isSafeInteger(p.ProcessId) &&
          p.ProcessId > 0 &&
          p.ExecutablePath &&
          this.normalizePath(p.ExecutablePath) === this.normalizePath(this.helperExePath)
      );

      if (matches.length === 1) {
        return {
          pid: Number(matches[0].ProcessId),
          creationDate: matches[0].CreationDate || null
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  async executeKill(pid) {
    if (process.platform === "win32") {
      await execFileAsync("taskkill", ["/PID", String(pid), "/F"]);
    } else {
      process.kill(pid, "SIGKILL");
    }
  }

  async terminateHelperRecord(record, targetPid) {
    const { sessionId, port } = record;
    if (!Number.isSafeInteger(targetPid) || targetPid <= 0) return;

    this.logger(`[SessionManager] Terminating helper in session ${sessionId} (PID ${targetPid})...`);

    // 1. Verify process identity BEFORE sending graceful shutdown IPC
    const discBefore = await this.findHelperProcesses();
    if (!discBefore.success) {
      this.logger(`[SessionManager] WARNING: Process discovery failed while verifying PID ${targetPid} before termination. Retrying later.`);
      record.state = "Unresolved";
      record.cleanupDiscoveryFailed = true;
      return;
    }

    record.cleanupDiscoveryFailed = false;
    const matchBefore = discBefore.processes.find((p) => Number(p.ProcessId) === Number(targetPid));
    let identityVerified = false;
    let expectedCreationDate = null;
    if (record.unresolvedHelpers && record.unresolvedHelpers.has(targetPid)) {
      expectedCreationDate = record.unresolvedHelpers.get(targetPid).creationDate;
    } else if (record.helperPid === targetPid) {
      expectedCreationDate = record.helperCreationDate;
    }

    if (
      matchBefore &&
      Number(matchBefore.SessionId) === Number(sessionId) &&
      matchBefore.ExecutablePath &&
      this.normalizePath(matchBefore.ExecutablePath) === this.normalizePath(this.helperExePath)
    ) {
      if (!expectedCreationDate || (matchBefore.CreationDate && matchBefore.CreationDate === expectedCreationDate)) {
        identityVerified = true;
      }
    }

    const verifiedCreationDate = expectedCreationDate || (matchBefore ? matchBefore.CreationDate : null) || null;

    if (!identityVerified) {
      this.logger(`[SessionManager] WARNING: PID ${targetPid} identity or creation time could not be verified prior to shutdown. Treating identity as stale.`);
      if (record.helperPid === targetPid) {
        record.helperPid = null;
        record.helperCreationDate = null;
      }
      if (record.unresolvedHelpers) {
        record.unresolvedHelpers.delete(targetPid);
      }
      if (!record.helperPid && (!record.unresolvedHelpers || record.unresolvedHelpers.size === 0) && !record.cleanupDiscoveryFailed) {
        record.state = "Discovered";
      }
      return;
    }

    // 2. Attempt graceful IPC shutdown & validate success response
    try {
      const res = await sendMessage(port, { type: "shutdown" });
      if (res && res.success) {
        this.logger(`[SessionManager] Shutdown acknowledged by helper in session ${sessionId}.`);
      }
    } catch {}

    // 3. Wait up to 5 seconds for process exit
    const startTime = Date.now();
    while (this.isProcessAlive(targetPid) && Date.now() - startTime < 5000) {
      await new Promise((r) => setTimeout(r, 200));
    }

    // 4. Revalidate process identity and creation time before force termination (anchored to verifiedCreationDate)
    if (this.isProcessAlive(targetPid)) {
      const disc = await this.findHelperProcesses();
      let verified = false;
      if (disc.success) {
        record.cleanupDiscoveryFailed = false;
        const match = disc.processes.find((p) => Number(p.ProcessId) === Number(targetPid));
        if (
          match &&
          Number(match.SessionId) === Number(sessionId) &&
          match.ExecutablePath &&
          this.normalizePath(match.ExecutablePath) === this.normalizePath(this.helperExePath)
        ) {
          if (!verifiedCreationDate || (match.CreationDate && match.CreationDate === verifiedCreationDate)) {
            verified = true;
          } else {
            this.logger(`[SessionManager] WARNING: PID ${targetPid} creation time mismatch during termination check. Suspected PID reuse; skipping force termination.`);
          }
        }
      } else {
        record.cleanupDiscoveryFailed = true;
      }

      if (verified) {
        this.logger(`[SessionManager] Helper PID ${targetPid} in session ${sessionId} did not exit gracefully. Force terminating...`);
        try {
          await this.executeKill(targetPid);
        } catch {}
      }
    }

    // 5. Confirm process exit before clearing helperPid and removing from unresolvedHelpers map
    const stillAlive = this.isProcessAlive(targetPid);
    if (!stillAlive) {
      if (record.helperPid === targetPid) {
        record.helperPid = null;
        record.helperCreationDate = null;
      }
      if (record.unresolvedHelpers) {
        record.unresolvedHelpers.delete(targetPid);
      }
      if (!record.helperPid && (!record.unresolvedHelpers || record.unresolvedHelpers.size === 0) && !record.cleanupDiscoveryFailed) {
        record.state = "Discovered";
      }
      this.logger(`[SessionManager] Helper in session ${sessionId} (PID ${targetPid}) successfully terminated.`);
    } else {
      record.state = "Unresolved";
      if (!record.unresolvedHelpers) record.unresolvedHelpers = new Map();
      record.unresolvedHelpers.set(targetPid, { pid: targetPid, sessionId, creationDate: verifiedCreationDate });
      this.logger(`[SessionManager] ERROR: Helper in session ${sessionId} (PID ${targetPid}) is still alive and could not be terminated. Marked Unresolved.`);
    }
  }
}
