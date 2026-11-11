using System;
using System.Diagnostics;
using System.IO;
using System.ServiceProcess;
using System.Threading;

namespace Sentrix.ServiceHost
{
    public class AgentServiceHost : ServiceBase
    {
        private Process _agentProcess;
        private volatile bool _isStopping = false;
        private Thread _monitorThread;
        private readonly string _exeDir;
        private readonly string _agentExePath;
        private readonly object _processLock = new object();
        private int _stopInitiated = 0; // 0 = false, 1 = true for idempotent shutdown
        private const string EventSource = "SentrixAgent";

        public AgentServiceHost()
        {
            this.ServiceName = "SentrixAgent";
            this.CanStop = true;
            this.CanShutdown = true;
            this.AutoLog = true;

            _exeDir = AppDomain.CurrentDomain.BaseDirectory;
            _agentExePath = Path.Combine(_exeDir, "sentrix-agent.exe");
        }

        public static void Main(string[] args)
        {
            ServiceBase.Run(new AgentServiceHost());
        }

        private void SafeLogEntry(string message, EventLogEntryType type)
        {
            try
            {
                EventLog.WriteEntry(EventSource, message, type);
            }
            catch
            {
                // Fallback logging or swallow to prevent log failure from blocking service startup/recovery
            }
        }

        protected override void OnStart(string[] args)
        {
            SafeLogEntry("SentrixAgent Service Host starting...", EventLogEntryType.Information);

            // Apply any pending zero-touch update swap from staging before starting agent
            ApplyPendingUpdate();

            if (!File.Exists(_agentExePath))
            {
                throw new FileNotFoundException("Agent executable not found at " + _agentExePath);
            }

            // Strict stale stop signal removal (let exceptions propagate so startup fails visibly)
            string stopSigPath = Path.Combine(_exeDir, "stop.sig");
            File.Delete(stopSigPath);

            _isStopping = false;
            Interlocked.Exchange(ref _stopInitiated, 0);
            StartAgentProcess();

            // Start background monitor thread to detect unexpected agent termination
            _monitorThread = new Thread(MonitorAgentProcess)
            {
                IsBackground = true,
                Name = "SentrixAgentMonitor"
            };
            _monitorThread.Start();
        }

        private void ApplyPendingUpdate()
        {
            string inProgressMarker = Path.Combine(_exeDir, ".update-in-progress");
            try
            {
                string readyMarker = Path.Combine(_exeDir, ".update-ready");
                if (!File.Exists(readyMarker))
                {
                    readyMarker = Path.Combine(_exeDir, ".deployment-ready");
                }
                string stagingDir = Path.Combine(_exeDir, "staging");
                string stagingExtractedDir = Path.Combine(stagingDir, "extracted");
                string watchdogLogPath = Path.Combine(_exeDir, "watchdog.log");

                if (!File.Exists(readyMarker) || !Directory.Exists(stagingExtractedDir))
                {
                    return;
                }

                // Create update-in-progress lock file to inform watchdog/monitors
                try { File.WriteAllText(inProgressMarker, DateTime.UtcNow.ToString("o")); } catch { }

                string timeStr = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss");
                string logHeader = "[" + timeStr + "] Update readiness marker detected. Applying clean-and-replace update swap from staging...\r\n";
                File.AppendAllText(watchdogLogPath, logHeader);

                // 1. Terminate any running helper processes to release file locks
                try
                {
                    foreach (var proc in Process.GetProcessesByName("sentrix-helper"))
                    {
                        try { proc.Kill(); proc.WaitForExit(2000); } catch { }
                    }
                }
                catch { }

                // 2. Hardcoded whitelist of files to preserve in root
                string[] preserveFiles = new string[] {
                    ".env",
                    "agent-id.txt",
                    "server.crt",
                    "agent.log",
                    "helper.log",
                    "watchdog.log",
                    "native-toast-debug.log",
                    "sentrix-agent.lock"
                };

                // 3. Clean root files except whitelisted ones and AgentServiceHost.exe
                foreach (string filePath in Directory.GetFiles(_exeDir))
                {
                    string fileName = Path.GetFileName(filePath);
                    if (string.Equals(fileName, "AgentServiceHost.exe", StringComparison.OrdinalIgnoreCase))
                    {
                        continue;
                    }
                    if (Array.Exists(preserveFiles, f => string.Equals(f, fileName, StringComparison.OrdinalIgnoreCase)))
                    {
                        continue;
                    }
                    try
                    {
                        File.SetAttributes(filePath, FileAttributes.Normal);
                        File.Delete(filePath);
                    }
                    catch (Exception ex)
                    {
                        File.AppendAllText(watchdogLogPath, "[" + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + "] Warning: Could not delete old file " + fileName + ": " + ex.Message + "\r\n");
                    }
                }

                // 4. Clean root subdirectories except staging
                foreach (string dirPath in Directory.GetDirectories(_exeDir))
                {
                    string dirName = Path.GetFileName(dirPath);
                    if (string.Equals(dirName, "staging", StringComparison.OrdinalIgnoreCase))
                    {
                        continue;
                    }
                    try
                    {
                        Directory.Delete(dirPath, true);
                    }
                    catch (Exception ex)
                    {
                        File.AppendAllText(watchdogLogPath, "[" + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + "] Warning: Could not delete old directory " + dirName + ": " + ex.Message + "\r\n");
                    }
                }

                // 5. Copy new files from staging/extracted recursively to root
                foreach (string newFilePath in Directory.GetFiles(stagingExtractedDir, "*.*", SearchOption.AllDirectories))
                {
                    string relativePath = newFilePath.Substring(stagingExtractedDir.Length + 1);
                    string targetFilePath = Path.Combine(_exeDir, relativePath);

                    if (string.Equals(Path.GetFileName(targetFilePath), "AgentServiceHost.exe", StringComparison.OrdinalIgnoreCase))
                    {
                        continue; // Skip currently running service host
                    }

                    string targetSubDir = Path.GetDirectoryName(targetFilePath);
                    if (!Directory.Exists(targetSubDir))
                    {
                        Directory.CreateDirectory(targetSubDir);
                    }

                    if (File.Exists(targetFilePath))
                    {
                        try { File.SetAttributes(targetFilePath, FileAttributes.Normal); } catch { }
                    }

                    File.Copy(newFilePath, targetFilePath, true);
                }

                // 6. Clean up ready marker and staging dir with retries
                try { File.Delete(readyMarker); } catch { }

                bool stagingCleaned = false;
                for (int attempt = 1; attempt <= 3; attempt++)
                {
                    try
                    {
                        if (Directory.Exists(stagingDir))
                        {
                            foreach (string sf in Directory.GetFiles(stagingDir, "*.*", SearchOption.AllDirectories))
                            {
                                try { File.SetAttributes(sf, FileAttributes.Normal); } catch { }
                            }
                            Directory.Delete(stagingDir, true);
                        }
                        stagingCleaned = true;
                        break;
                    }
                    catch
                    {
                        Thread.Sleep(500);
                    }
                }

                string timeStr2 = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss");
                string logFooter = "[" + timeStr2 + "] Clean-and-replace update swap applied successfully (staging cleaned: " + stagingCleaned + "). Launching updated agent...\r\n";
                File.AppendAllText(watchdogLogPath, logFooter);
                SafeLogEntry("Clean-and-replace update swap applied successfully from staging.", EventLogEntryType.Information);
            }
            catch (Exception ex)
            {
                string timeStr3 = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss");
                string logError = "[" + timeStr3 + "] ERROR applying clean-and-replace update swap: " + ex.Message + "\r\n";
                try
                {
                    File.AppendAllText(Path.Combine(_exeDir, "watchdog.log"), logError);
                }
                catch { }
                SafeLogEntry("Failed to apply update swap: " + ex.Message, EventLogEntryType.Error);
            }
            finally
            {
                try { if (File.Exists(inProgressMarker)) File.Delete(inProgressMarker); } catch { }
            }
        }

        private void StartAgentProcess()
        {
            var startInfo = new ProcessStartInfo
            {
                FileName = _agentExePath,
                Arguments = "--service",
                WorkingDirectory = _exeDir,
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = false,
                RedirectStandardError = false
            };

            var process = Process.Start(startInfo);
            if (process == null)
            {
                throw new InvalidOperationException("Failed to start sentrix-agent.exe process.");
            }

            lock (_processLock)
            {
                _agentProcess = process;
            }
            SafeLogEntry("Sentrix Agent process started with PID " + process.Id, EventLogEntryType.Information);
        }

        private void MonitorAgentProcess()
        {
            try
            {
                while (!_isStopping)
                {
                    Process currentProcess;
                    lock (_processLock)
                    {
                        currentProcess = _agentProcess;
                    }

                    if (currentProcess == null)
                    {
                        break;
                    }

                    currentProcess.WaitForExit(1000);

                    if (_isStopping)
                    {
                        break;
                    }

                    bool hasExited = false;
                    try
                    {
                        hasExited = currentProcess.HasExited;
                    }
                    catch
                    {
                        hasExited = true;
                    }

                    if (hasExited)
                    {
                        int exitCode = 0;
                        try
                        {
                            exitCode = currentProcess.ExitCode;
                        }
                        catch { }

                        SafeLogEntry("Sentrix Agent process exited unexpectedly with code " + exitCode + ".", EventLogEntryType.Warning);

                        if (!_isStopping)
                        {
                            // Unexpected termination: exit host with nonzero exit code so SCM detects failure and applies recovery
                            Environment.Exit(exitCode != 0 ? exitCode : 1066);
                        }
                        break;
                    }
                }
            }
            catch (Exception ex)
            {
                SafeLogEntry("Fatal error in Agent monitor thread: " + ex.Message, EventLogEntryType.Error);
                Environment.Exit(1067);
            }
        }

        protected override void OnStop()
        {
            StopServiceInternal();
        }

        protected override void OnShutdown()
        {
            StopServiceInternal();
        }

        private void StopServiceInternal()
        {
            // Idempotent shutdown check
            if (Interlocked.Exchange(ref _stopInitiated, 1) == 1)
            {
                return;
            }

            try
            {
                RequestAdditionalTime(15000);
            }
            catch { }

            SafeLogEntry("SentrixAgent Service Host stopping...", EventLogEntryType.Information);
            _isStopping = true;

            Process targetProcess;
            lock (_processLock)
            {
                targetProcess = _agentProcess;
            }

            try
            {
                // 1. Request graceful shutdown via stop signal file
                string stopSigPath = Path.Combine(_exeDir, "stop.sig");
                File.WriteAllText(stopSigPath, DateTime.UtcNow.ToString("o"));

                // 2. Wait up to 10 seconds for graceful agent exit
                if (targetProcess != null)
                {
                    bool exited = false;
                    try
                    {
                        exited = targetProcess.WaitForExit(10000);
                    }
                    catch { }

                    if (!exited)
                    {
                        SafeLogEntry("Sentrix Agent did not shut down gracefully within 10s. Forcing termination...", EventLogEntryType.Warning);
                        try
                        {
                            targetProcess.Kill();
                            exited = targetProcess.WaitForExit(3000);
                        }
                        catch (Exception killEx)
                        {
                            SafeLogEntry("Failed to force terminate Agent process: " + killEx.Message, EventLogEntryType.Error);
                        }
                    }

                    bool finalHasExited = false;
                    try
                    {
                        finalHasExited = targetProcess.HasExited;
                    }
                    catch (Exception ex)
                    {
                        SafeLogEntry("Error verifying process exit status: " + ex.Message, EventLogEntryType.Error);
                        finalHasExited = false;
                    }

                    if (!finalHasExited)
                    {
                        SafeLogEntry("CRITICAL: Sentrix Agent failed to terminate during shutdown.", EventLogEntryType.Error);
                        throw new InvalidOperationException("Sentrix Agent failed to terminate during service shutdown.");
                    }
                }
            }
            catch (Exception ex)
            {
                SafeLogEntry("Error during service stop: " + ex.Message, EventLogEntryType.Error);
                // Restore shutdown state so stop can be retried and monitoring can resume if service remains running
                _isStopping = false;
                Interlocked.Exchange(ref _stopInitiated, 0);
                throw;
            }
            finally
            {
                try
                {
                    string stopSigPath = Path.Combine(_exeDir, "stop.sig");
                    if (File.Exists(stopSigPath)) File.Delete(stopSigPath);
                }
                catch { }
            }

            SafeLogEntry("SentrixAgent Service Host stopped.", EventLogEntryType.Information);
        }
    }
}
