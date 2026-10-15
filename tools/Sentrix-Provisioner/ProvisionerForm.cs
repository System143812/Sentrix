using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;

namespace SentrixProvisioner
{
    public class ProvisionerForm : Form
    {
        private Label titleLabel;
        private ProgressBar progressBar;
        private Label statusLabel;
        private RichTextBox outputBox;
        private Button closeButton;
        private System.Windows.Forms.Timer autoCloseTimer;
        private int autoCloseSeconds = 5;
        private bool isSuccess = false;

        public ProvisionerForm()
        {
            InitializeComponent();
            this.Load += ProvisionerForm_Load;
        }

        private void InitializeComponent()
        {
            // Form settings
            this.Text = "Sentrix PC Provisioner";
            this.Size = new Size(600, 500);
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.MinimizeBox = false;
            this.StartPosition = FormStartPosition.CenterScreen;
            this.BackColor = Color.FromArgb(15, 23, 42); // Dark slate background
            this.ForeColor = Color.White;
            this.Font = new Font("Segoe UI", 9F);

            // Title label with logo
            titleLabel = new Label
            {
                Text = " SENTRIX PC Provisioner",
                Font = new Font("Segoe UI", 16F, FontStyle.Bold),
                ForeColor = Color.White,
                AutoSize = false,
                Size = new Size(560, 40),
                Location = new Point(20, 20),
                TextAlign = ContentAlignment.MiddleLeft
            };

            // Progress bar
            progressBar = new ProgressBar
            {
                Size = new Size(540, 25),
                Location = new Point(20, 70),
                Style = ProgressBarStyle.Continuous
            };

            // Status label
            statusLabel = new Label
            {
                Text = "Initializing...",
                Font = new Font("Segoe UI", 10F),
                ForeColor = Color.FromArgb(148, 163, 184), // Slate-400
                AutoSize = false,
                Size = new Size(540, 25),
                Location = new Point(20, 100),
                TextAlign = ContentAlignment.MiddleLeft
            };

            // Output box
            outputBox = new RichTextBox
            {
                Size = new Size(540, 280),
                Location = new Point(20, 130),
                BackColor = Color.FromArgb(30, 41, 59), // Slate-800
                ForeColor = Color.FromArgb(226, 232, 240), // Slate-200
                Font = new Font("Consolas", 9F),
                BorderStyle = BorderStyle.None,
                ReadOnly = true,
                ScrollBars = RichTextBoxScrollBars.Vertical
            };

            // Close button
            closeButton = new Button
            {
                Text = "Close",
                Size = new Size(100, 35),
                Location = new Point(460, 420),
                BackColor = Color.FromArgb(71, 85, 105), // Slate-600
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat,
                Enabled = false
            };
            closeButton.FlatAppearance.BorderSize = 0;
            closeButton.Click += (s, e) => this.Close();

            // Add controls
            this.Controls.Add(titleLabel);
            this.Controls.Add(progressBar);
            this.Controls.Add(statusLabel);
            this.Controls.Add(outputBox);
            this.Controls.Add(closeButton);

            // Auto-close timer
            autoCloseTimer = new System.Windows.Forms.Timer();
            autoCloseTimer.Interval = 1000;
            autoCloseTimer.Tick += AutoCloseTimer_Tick;
        }

        private void ProvisionerForm_Load(object sender, EventArgs e)
        {
            // Check if running as administrator
            if (!IsAdministrator())
            {
                statusLabel.Text = "Administrator privileges required. Please run as Administrator.";
                statusLabel.ForeColor = Color.FromArgb(239, 68, 68); // Red-500
                AppendOutput("ERROR: This application requires Administrator privileges.", Color.Red);
                AppendOutput("Right-click the application and select 'Run as administrator'.", Color.Yellow);
                closeButton.Enabled = true;
                return;
            }

            // Start the provisioning process
            Thread runnerThread = new Thread(RunProvisioner);
            runnerThread.IsBackground = true;
            runnerThread.Start();
        }

        private bool IsAdministrator()
        {
            using (var identity = System.Security.Principal.WindowsIdentity.GetCurrent())
            {
                var principal = new System.Security.Principal.WindowsPrincipal(identity);
                return principal.IsInRole(System.Security.Principal.WindowsBuiltInRole.Administrator);
            }
        }

        private void RunProvisioner()
        {
            try
            {
                UpdateStatus("Preparing provisioner script...");
                AppendOutput("[INFO] Starting Sentrix PC Provisioner...", Color.Cyan);

                // Extract embedded PowerShell script
                string scriptPath = ExtractEmbeddedScript();
                if (string.IsNullOrEmpty(scriptPath))
                {
                    UpdateStatus("Failed to extract provisioner script.");
                    AppendOutput("[ERROR] Could not extract embedded PowerShell script.", Color.Red);
                    SetFailure();
                    return;
                }

                AppendOutput("[INFO] Script extracted successfully.", Color.Green);

                // Run PowerShell script
                RunPowerShellScript(scriptPath);

                // Clean up temp script
                try
                {
                    if (File.Exists(scriptPath))
                        File.Delete(scriptPath);
                }
                catch { }
            }
            catch (Exception ex)
            {
                UpdateStatus("An error occurred.");
                AppendOutput($"[ERROR] {ex.Message}", Color.Red);
                SetFailure();
            }
        }

        private string ExtractEmbeddedScript()
        {
            try
            {
                var assembly = Assembly.GetExecutingAssembly();
                string resourceName = "SentrixProvisioner.Resources.provisioner.ps1";

                string tempPath = Path.Combine(Path.GetTempPath(), $"sentrix-provisioner-{Guid.NewGuid()}.ps1");

                using (Stream stream = assembly.GetManifestResourceStream(resourceName))
                {
                    if (stream == null)
                        return null;

                    using (StreamReader reader = new StreamReader(stream))
                    {
                        string scriptContent = reader.ReadToEnd();
                        File.WriteAllText(tempPath, scriptContent, Encoding.UTF8);
                    }
                }

                return tempPath;
            }
            catch
            {
                return null;
            }
        }

        private void RunPowerShellScript(string scriptPath)
        {
            ProcessStartInfo psi = new ProcessStartInfo
            {
                FileName = "powershell.exe",
                Arguments = $"-NoProfile -ExecutionPolicy Bypass -File \"{scriptPath}\"",
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true,
                StandardOutputEncoding = Encoding.UTF8,
                StandardErrorEncoding = Encoding.UTF8
            };

            using (Process process = new Process())
            {
                process.StartInfo = psi;
                process.OutputDataReceived += (s, e) =>
                {
                    if (!string.IsNullOrEmpty(e.Data))
                        ProcessOutputLine(e.Data);
                };

                process.ErrorDataReceived += (s, e) =>
                {
                    if (!string.IsNullOrEmpty(e.Data))
                        ProcessOutputLine(e.Data);
                };

                process.Start();
                process.BeginOutputReadLine();
                process.BeginErrorReadLine();
                process.WaitForExit();

                if (process.ExitCode == 0)
                {
                    SetSuccess();
                }
                else
                {
                    AppendOutput($"\n[ERROR] Process exited with code {process.ExitCode}", Color.Red);
                    SetFailure();
                }
            }
        }

        private void ProcessOutputLine(string line)
        {
            // Detect step progress
            if (line.Contains("[1/6]"))
            {
                UpdateProgress(1, 6);
                UpdateStatus("Enabling Administrator account...");
            }
            else if (line.Contains("[2/6]"))
            {
                UpdateProgress(2, 6);
                UpdateStatus("Setting Administrator password...");
            }
            else if (line.Contains("[3/6]"))
            {
                UpdateProgress(3, 6);
                UpdateStatus("Configuring Remote UAC policy...");
            }
            else if (line.Contains("[4/6]"))
            {
                UpdateProgress(4, 6);
                UpdateStatus("Opening Firewall Ports...");
            }
            else if (line.Contains("[5/6]"))
            {
                UpdateProgress(5, 6);
                UpdateStatus("Adding Windows Defender Exclusions...");
            }
            else if (line.Contains("[6/6]"))
            {
                UpdateProgress(6, 6);
                UpdateStatus("Creating Watchdog task...");
            }
            else if (line.Contains("Prep Complete"))
            {
                UpdateProgress(6, 6);
                UpdateStatus("Provisioning complete!");
            }

            // Color coding for output
            if (line.Contains("[OK]"))
            {
                AppendOutput(line, Color.FromArgb(34, 197, 94)); // Green-500
            }
            else if (line.Contains("[FAILED]") || line.Contains("[ERROR]"))
            {
                AppendOutput(line, Color.FromArgb(239, 68, 68)); // Red-500
            }
            else if (line.Contains("[SKIPPED]"))
            {
                AppendOutput(line, Color.FromArgb(234, 179, 8)); // Yellow-500
            }
            else
            {
                AppendOutput(line, Color.FromArgb(226, 232, 240)); // Slate-200
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

        private void SetSuccess()
        {
            if (this.InvokeRequired)
            {
                this.Invoke(new Action(SetSuccess));
                return;
            }

            isSuccess = true;
            statusLabel.Text = "Provisioning complete! Closing in 5 seconds...";
            statusLabel.ForeColor = Color.FromArgb(34, 197, 94); // Green-500

            AppendOutput("\n========================================", Color.Cyan);
            AppendOutput("SUCCESS: PC is ready for Sentrix deployment!", Color.Green);
            AppendOutput("You can now deploy the agent from the Sentrix Dashboard.", Color.White);
            AppendOutput("========================================", Color.Cyan);

            closeButton.Text = "Close (5)";
            closeButton.Enabled = true;
            closeButton.BackColor = Color.FromArgb(34, 197, 94);

            autoCloseTimer.Start();
        }

        private void SetFailure()
        {
            if (this.InvokeRequired)
            {
                this.Invoke(new Action(SetFailure));
                return;
            }

            isSuccess = false;
            statusLabel.Text = "Provisioning failed. Please check the output above.";
            statusLabel.ForeColor = Color.FromArgb(239, 68, 68); // Red-500

            closeButton.Text = "Close";
            closeButton.Enabled = true;
            closeButton.BackColor = Color.FromArgb(239, 68, 68);
        }

        private void AutoCloseTimer_Tick(object sender, EventArgs e)
        {
            autoCloseSeconds--;

            if (autoCloseSeconds > 0)
            {
                closeButton.Text = $"Close ({autoCloseSeconds})";
            }
            else
            {
                autoCloseTimer.Stop();
                this.Close();
            }
        }
    }
}
