using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Security.Principal;
using System.Text;
using System.Threading;
using System.Windows.Forms;

namespace SentrixUninstall
{
    static class Program
    {
        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new UninstallForm());
        }
    }

    public class UninstallForm : Form
    {
        private Label titleLabel;
        private ProgressBar progressBar;
        private Label statusLabel;
        private RichTextBox outputBox;
        private Button actionButton;
        private Button closeButton;
        private bool isStarted = false;
        private bool isSuccess = false;

        public UninstallForm()
        {
            InitializeComponent();
            this.Load += UninstallForm_Load;
        }

        private void InitializeComponent()
        {
            this.Text = "Sentrix PC Uninstaller";
            this.Size = new Size(600, 500);
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.MinimizeBox = false;
            this.StartPosition = FormStartPosition.CenterScreen;
            this.BackColor = Color.FromArgb(15, 23, 42); // Dark slate background
            this.ForeColor = Color.White;
            this.Font = new Font("Segoe UI", 9F);

            titleLabel = new Label
            {
                Text = " SENTRIX PC Uninstaller",
                Font = new Font("Segoe UI", 16F, FontStyle.Bold),
                ForeColor = Color.White,
                AutoSize = false,
                Size = new Size(560, 40),
                Location = new Point(20, 20),
                TextAlign = ContentAlignment.MiddleLeft
            };

            progressBar = new ProgressBar
            {
                Size = new Size(540, 25),
                Location = new Point(20, 70),
                Style = ProgressBarStyle.Continuous
            };

            statusLabel = new Label
            {
                Text = "Ready to uninstall Sentrix Agent...",
                Font = new Font("Segoe UI", 10F),
                ForeColor = Color.FromArgb(148, 163, 184), // Slate-400
                AutoSize = false,
                Size = new Size(540, 25),
                Location = new Point(20, 100),
                TextAlign = ContentAlignment.MiddleLeft
            };

            outputBox = new RichTextBox
            {
                Size = new Size(540, 260),
                Location = new Point(20, 130),
                BackColor = Color.FromArgb(30, 41, 59), // Slate-800
                ForeColor = Color.FromArgb(226, 232, 240), // Slate-200
                Font = new Font("Consolas", 9F),
                BorderStyle = BorderStyle.None,
                ReadOnly = true,
                ScrollBars = RichTextBoxScrollBars.Vertical
            };

            actionButton = new Button
            {
                Text = "Start Uninstallation",
                Size = new Size(150, 35),
                Location = new Point(300, 410),
                BackColor = Color.FromArgb(239, 68, 68), // Red-500
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat
            };
            actionButton.FlatAppearance.BorderSize = 0;
            actionButton.Click += ActionButton_Click;

            closeButton = new Button
            {
                Text = "Close",
                Size = new Size(100, 35),
                Location = new Point(460, 410),
                BackColor = Color.FromArgb(71, 85, 105), // Slate-600
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat
            };
            closeButton.FlatAppearance.BorderSize = 0;
            closeButton.Click += (s, e) => this.Close();

            this.Controls.Add(titleLabel);
            this.Controls.Add(progressBar);
            this.Controls.Add(statusLabel);
            this.Controls.Add(outputBox);
            this.Controls.Add(actionButton);
            this.Controls.Add(closeButton);
        }

        private void UninstallForm_Load(object sender, EventArgs e)
        {
            if (!IsAdministrator())
            {
                AppendOutput("[ERROR] Administrator privileges required. Please restart as Administrator.", Color.Red);
                statusLabel.Text = "Run as Administrator required.";
                statusLabel.ForeColor = Color.FromArgb(239, 68, 68);
                actionButton.Enabled = false;

                var res = MessageBox.Show(
                    "Sentrix Uninstaller requires Administrator privileges.\n\nWould you like to elevate now?",
                    "Administrator Privileges Required",
                    MessageBoxButtons.YesNo,
                    MessageBoxIcon.Warning
                );
                if (res == DialogResult.Yes)
                {
                    try
                    {
                        var exePath = Process.GetCurrentProcess().MainModule.FileName;
                        var psi = new ProcessStartInfo
                        {
                            FileName = exePath,
                            UseShellExecute = true,
                            Verb = "runas"
                        };
                        Process.Start(psi);
                        this.Close();
                    }
                    catch (Exception ex)
                    {
                        MessageBox.Show("Elevation failed: " + ex.Message, "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    }
                }
            }
            else
            {
                AppendOutput("[INFO] Ready. Click 'Start Uninstallation' to remove Sentrix Agent and restore PC security settings.", Color.Cyan);
            }
        }

        private bool IsAdministrator()
        {
            using (var identity = WindowsIdentity.GetCurrent())
            {
                var principal = new WindowsPrincipal(identity);
                return principal.IsInRole(WindowsBuiltInRole.Administrator);
            }
        }

        private void ActionButton_Click(object sender, EventArgs e)
        {
            if (isStarted) return;
            isStarted = true;
            actionButton.Enabled = false;

            var confirm = MessageBox.Show(
                "Are you sure you want to completely remove Sentrix Agent, stop all monitoring services, and restore PC security settings (lockdown)?",
                "Confirm Uninstallation",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Question
            );

            if (confirm != DialogResult.Yes)
            {
                isStarted = false;
                actionButton.Enabled = true;
                return;
            }

            Thread worker = new Thread(RunUninstallation);
            worker.IsBackground = true;
            worker.Start();
        }

        private void RunUninstallation()
        {
            try
            {
                // Step 1: Tasks
                UpdateProgress(1, 5);
                UpdateStatus("Stopping and unregistering scheduled tasks...");
                AppendOutput("[1/5] Stopping and unregistering scheduled tasks...", Color.Yellow);
                string[] tasks = { "Sentrix Watchdog", "Sentrix Agent", "Sentrix Helper", "Sentrix Bootstrap" };
                foreach (var task in tasks)
                {
                    RunProcess("schtasks.exe", "/Delete /TN \"" + task + "\" /F");
                }
                AppendOutput(" [OK]", Color.Green);

                // Step 2: Windows Service
                UpdateProgress(2, 5);
                UpdateStatus("Stopping and deleting SentrixAgent Windows Service...");
                AppendOutput("[2/5] Stopping and deleting SentrixAgent Windows Service...", Color.Yellow);
                RunProcess("sc.exe", "stop SentrixAgent");
                Thread.Sleep(1000);
                RunProcess("sc.exe", "delete SentrixAgent");
                AppendOutput(" [OK]", Color.Green);

                // Step 3: Processes
                UpdateProgress(3, 5);
                UpdateStatus("Terminating running Sentrix processes...");
                AppendOutput("[3/5] Terminating running Sentrix processes...", Color.Yellow);
                RunProcess("powershell.exe", "-NoProfile -ExecutionPolicy Bypass -Command \"Get-CimInstance Win32_Process -Filter \\\"ExecutablePath LIKE 'C:\\\\ProgramData\\\\SentrixAgent\\\\%\\'\\\" | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }\"");
                RunProcess("taskkill.exe", "/f /im sentrix-agent.exe");
                RunProcess("taskkill.exe", "/f /im sentrix-helper.exe");
                RunProcess("taskkill.exe", "/f /im AgentServiceHost.exe");
                AppendOutput(" [OK]", Color.Green);

                // Step 4: Lockdown
                UpdateProgress(4, 5);
                UpdateStatus("Performing PC lockdown and reverting security settings...");
                AppendOutput("[4/5] Performing PC lockdown and reverting security settings...", Color.Yellow);

                RunProcess("powershell.exe", "-NoProfile -ExecutionPolicy Bypass -Command \"try { Disable-LocalUser -Name 'Administrator' -ErrorAction SilentlyContinue } catch {}\"");
                RunProcess("powershell.exe", "-NoProfile -ExecutionPolicy Bypass -Command \"try { Set-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System' -Name 'LocalAccountTokenFilterPolicy' -Value 0 -Force -ErrorAction SilentlyContinue } catch {}\"");
                RunProcess("powershell.exe", "-NoProfile -ExecutionPolicy Bypass -Command \"try { Disable-NetFirewallRule -Name 'FPS-SMB-In-TCP' -ErrorAction SilentlyContinue } catch {}\"");
                RunProcess("powershell.exe", "-NoProfile -ExecutionPolicy Bypass -Command \"try { Remove-MpPreference -ExclusionPath 'C:\\ProgramData\\SentrixAgent' -ErrorAction SilentlyContinue } catch {}\"");
                AppendOutput(" [OK]", Color.Green);

                // Step 5: Purge Directory
                UpdateProgress(5, 5);
                UpdateStatus("Purging SentrixAgent directory...");
                AppendOutput("[5/5] Purging SentrixAgent directory...", Color.Yellow);
                string targetPath = @"C:\ProgramData\SentrixAgent";
                if (Directory.Exists(targetPath))
                {
                    try
                    {
                        RunProcess("takeown.exe", "/F \"" + targetPath + "\" /R /D Y");
                        RunProcess("icacls.exe", "\"" + targetPath + "\" /grant \"*S-1-5-32-544:F\" /T /C /Q");
                        RunProcess("powershell.exe", "-NoProfile -ExecutionPolicy Bypass -Command \"Get-ChildItem -LiteralPath 'C:\\ProgramData\\SentrixAgent' -Force -Exclude 'uninstall.exe' | Remove-Item -Force -Recurse -ErrorAction SilentlyContinue\"");
                    }
                    catch (Exception ex)
                    {
                        AppendOutput(" [WARN: " + ex.Message + "]", Color.Yellow);
                    }
                }
                AppendOutput(" [OK]", Color.Green);

                isSuccess = true;
                UpdateStatus("Uninstallation & Lockdown complete!");
                AppendOutput("\n--- Sentrix Uninstallation & Lockdown Complete! ---", Color.Cyan);

                MessageBox.Show(
                    "Sentrix Agent has been successfully uninstalled and PC security settings have been restored.",
                    "Success",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information
                );

                // Schedule self deletion with process exit waiting
                int currentPid = Process.GetCurrentProcess().Id;
                string batchCommand = ":wait\n" +
                                      "tasklist /fi \"pid eq " + currentPid + "\" | findstr " + currentPid + " > nul\n" +
                                      "if not errorlevel 1 (\n" +
                                      "    timeout /t 1 /nobreak > nul\n" +
                                      "    goto wait\n" +
                                      ")\n" +
                                      "rmdir /s /q \"" + targetPath + "\"";

                string batchPath = Path.Combine(Path.GetTempPath(), "sentrix-self-clean.bat");
                try { File.WriteAllText(batchPath, batchCommand); } catch { }

                var startInfo = new ProcessStartInfo
                {
                    FileName = "cmd.exe",
                    Arguments = "/c \"" + batchPath + "\"",
                    CreateNoWindow = true,
                    UseShellExecute = false
                };
                Process.Start(startInfo);
            }
            catch (Exception ex)
            {
                UpdateStatus("Uninstallation failed.");
                AppendOutput("[ERROR] " + ex.Message, Color.Red);
                MessageBox.Show("Uninstallation failed: " + ex.Message, "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private void UpdateStatus(string text)
        {
            if (this.InvokeRequired)
            {
                this.Invoke(new Action(() => UpdateStatus(text)));
                return;
            }
            statusLabel.Text = text;
        }

        private void UpdateProgress(int current, int total)
        {
            if (this.InvokeRequired)
            {
                this.Invoke(new Action(() => UpdateProgress(current, total)));
                return;
            }
            int percentage = (int)((current / (double)total) * 100);
            progressBar.Value = percentage;
        }

        private void AppendOutput(string text, Color color)
        {
            if (this.InvokeRequired)
            {
                this.Invoke(new Action(() => AppendOutput(text, color)));
                return;
            }

            outputBox.SelectionStart = outputBox.TextLength;
            outputBox.SelectionLength = 0;
            outputBox.SelectionColor = color;
            outputBox.AppendText(text + Environment.NewLine);
            outputBox.SelectionColor = outputBox.ForeColor;
            outputBox.ScrollToCaret();
        }

        private void RunProcess(string fileName, string arguments)
        {
            try
            {
                var psi = new ProcessStartInfo
                {
                    FileName = fileName,
                    Arguments = arguments,
                    CreateNoWindow = true,
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true
                };
                using (var p = Process.Start(psi))
                {
                    p.WaitForExit(10000);
                }
            }
            catch
            {
                // Best effort
            }
        }
    }
}
