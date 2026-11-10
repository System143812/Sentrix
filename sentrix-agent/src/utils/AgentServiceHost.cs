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
            try
            {
                string readyMarker = Path.Combine(_exeDir, ".update-ready");
                string stagingDir = Path.Combine(_exeDir, "staging");
                string stagingExtractedDir = Path.Combine(stagingDir, "extracted");
                string watchdogLogPath = Path.Combine(_exeDir, "watchdog.log");

                if (!File.Exists(readyMarker) || !Directory.Exists(stagingExtractedDir))
                {
                    return;
                }

                string timeStr = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss");
                string logHeader = "[" + timeStr + "] Update readiness marker detected. Applying update swap from staging...\r\n";
                File.AppendAllText(watchdogLogPath, logHeader);

                // Copy files recursively, skipping AgentServiceHost.exe
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

                    File.Copy(newFilePath, targetFilePath, true);
                }

                // Clean up ready marker and staging dir
                try { File.Delete(readyMarker); } catch { }
                try { Directory.Delete(stagingDir, true); } catch { }

                string timeStr2 = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss");
                string logFooter = "[" + timeStr2 + "] Update swap applied successfully. Launching updated agent...\r\n";
                File.AppendAllText(watchdogLogPath, logFooter);
                SafeLogEntry("Update swap applied successfully from staging.", EventLogEntryType.Information);
            }
            catch (Exception ex)
            {
                string timeStr3 = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss");
                string logError = "[" + timeStr3 + "] ERROR applying update swap: " + ex.Message + "\r\n";
                try
                {
                    File.AppendAllText(Path.Combine(_exeDir, "watchdog.log"), logError);
                }
                catch { }
                SafeLogEntry("Failed to apply update swap: " + ex.Message, EventLogEntryType.Error);
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
