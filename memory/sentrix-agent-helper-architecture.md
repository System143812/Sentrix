---
name: sentrix-agent-helper-architecture
description: Architectural separation between Sentrix SYSTEM Agent and user-session Helper, and Task Scheduler lifecycle behavior.
metadata:
  type: project
---

# Sentrix Agent & Helper Architecture

- **Sentrix Agent**: Runs as `SYSTEM` via Task Scheduler (`Sentrix Agent` task) at system startup (`-AtStartup`). Handles telemetry, socket communication, hardware monitoring, and update staging.
- **Sentrix Helper**: Runs in the interactive user session (Session 1+) as an elevated user/group via Task Scheduler (`Sentrix Helper` task) at user logon (`-AtLogOn`). It hosts an IPC TCP listener on port 4101 to execute user-interactive actions such as WPF broadcast dialogs (`broadcast-dialog.ps1`) and workstation locking (`LockWorkStation`), avoiding Session 0 isolation limitations where UI dialogs are hidden.

## Key Troubleshooting & Design Learnings
1. **Task Scheduler Trigger & Action Syntax for Helper**: 
   - When running Node.js binaries or PowerShell scripts from Scheduled Tasks in user sessions, using `-AtLogOn` without a repeating trigger or without ensuring the user is logged in can leave the task in "Ready" status rather than "Running" (since no user has logged on yet, or AtLogOn hasn't fired).
   - If `sentrix-helper.exe` is run directly by double-clicking or manual invocation (`powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command '& "C:\ProgramData\SentrixAgent\sentrix-helper.exe"'`), it starts immediately because it runs in the active user session.
   - However, via Task Scheduler, if `-AtLogOn` task is registered for group "Users", Task Scheduler creates it in a disabled/ready state until an actual interactive user logon event occurs.
2. **Watchdog Management**:
   - The `Sentrix Watchdog` runs every minute as `SYSTEM` (`Sentrix Watchdog` task). It checks if `sentrix-agent` is running, and checks if `sentrix-helper` is listening on IPC port `4101`.
   - If the helper is not listening, the watchdog should ensure the task starts or launch it correctly in the interactive session.
3. **Automatic Updates & File Locking**:
   - Agent updates use `sentrix-agent-update.exe` and `sentrix-helper-update.exe` staged by the watchdog/socket service and swapped cleanly with retries after terminating old processes and tasks.
   - Unlike the agent, the helper process releases its executable file lock cleanly when terminated or restarted.
