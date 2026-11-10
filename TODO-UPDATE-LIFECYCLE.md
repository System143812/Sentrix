# TODO: Watchdog & Agent Update Lifecycle Improvements

> **Status**: Deferred for future implementation.
> **Priority**: Post-SCM 1053 stabilization.

## Purpose
This document preserves the requirements and architectural design for a robust, production-grade update and rollback lifecycle for the Sentrix Agent watchdog. 

---

## Deferral Notice
- **Do not implement or modify existing update logic yet.**
- **Focus exclusively on fixing the Windows SCM 1053 issue** and getting `SentrixAgent` properly registered, started, and stable as a Windows service.
- Once SCM integration is fixed, tested, and stable, revisit this document to implement the update lifecycle.

---

## Required Update Lifecycle Features

1. **Session-Aware Graceful Helper Shutdown**
   - Avoid blanket global `taskkill` commands across all sessions.
   - Coordinate graceful shutdown of Sentrix Helpers per user session through the Agent's IPC / session-management layer.

2. **PID-Specific Process Cleanup**
   - Identify helper processes by specific session IDs and PIDs before termination.
   - Only use force-termination as a fallback after graceful shutdown timeouts expire.

3. **Verified Backups & Safe Binary Replacement**
   - Preserve the original executable as a backup (`.bak`) before moving staged update binaries into place.
   - Do not delete the backup immediately upon a successful file move.

4. **Replacement Integrity & Version Validation**
   - Validate that the new executable exists, is non-empty, and passes integrity/version checks before finalizing the update.

5. **Actual Agent Health Checks**
   - Start the Agent service and perform meaningful health checks against SCM status (e.g., verifying `Running` status for a sustained period) and operational metrics (`agent.log`).

6. **Automatic Rollback & Rollback Validation**
   - If replacement validation fails (crash, start failure, or unhealthy state), automatically stop the service, restore the backup binary (`.bak`), restart the service, and validate rollback success.

7. **Failed Binary Quarantine**
   - Retain or quarantine failed update binaries for telemetry and debugging rather than blindly deleting them.

8. **Agent & Helper Version Compatibility Checks**
   - Ensure compatibility between updated agent binaries and existing helper versions before committing updates.

9. **Protection Against Concurrent Update Operations**
   - Implement locking or synchronization mechanisms to prevent race conditions from concurrent update triggers.
