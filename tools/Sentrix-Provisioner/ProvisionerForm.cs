using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
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
            string tempDir = null;
            try
            {
                UpdateStatus("Preparing provisioner environment...");
                AppendOutput("[INFO] Starting Sentrix PC Provisioner...", Color.Cyan);

                // Extract embedded resources into secure temp directory
                tempDir = ExtractEmbeddedResources();
                if (string.IsNullOrEmpty(tempDir))
                {
                    UpdateStatus("Failed to extract provisioner resources.");
                    AppendOutput("[ERROR] Could not extract embedded resources.", Color.Red);
                    SetFailure();
                    return;
                }

                AppendOutput("[INFO] Resources extracted successfully.", Color.Green);

                string scriptPath = Path.Combine(tempDir, "provisioner.ps1");
                // Run PowerShell script with working directory set to tempDir
                RunPowerShellScript(scriptPath, tempDir);
            }
            catch (Exception ex)
            {
                UpdateStatus("An error occurred.");
                AppendOutput(string.Format("[ERROR] {0}", ex.Message), Color.Red);
                SetFailure();
            }
            finally
            {
                if (!string.IsNullOrEmpty(tempDir) && Directory.Exists(tempDir))
                {
                    try
                    {
                        Directory.Delete(tempDir, true);
                    }
                    catch (Exception ex)
                    {
                        AppendOutput(string.Format("[WARN] Could not fully clean up temporary directory '{0}': {1}. Sensitive extracted files may remain.", tempDir, ex.Message), Color.Yellow);
                    }
                }
            }
        }

        private string ExtractEmbeddedResources()
        {
            string tempDir = null;
            try
            {
                var assembly = Assembly.GetExecutingAssembly();
                tempDir = Path.Combine(Path.GetTempPath(), "sentrix-provisioner-" + Guid.NewGuid());

                var currentUser = WindowsIdentity.GetCurrent().User;
                if (currentUser == null)
                {
                    throw new InvalidOperationException("Failed to resolve current user Windows identity SID.");
                }

                var systemSid = new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null);

                // Create secure temporary directory with restrictive DirectorySecurity and propagation to child files/subdirectories from the outset
                var security = new DirectorySecurity();
                security.SetAccessRuleProtection(true, false);
                security.AddAccessRule(new FileSystemAccessRule(
                    currentUser,
                    FileSystemRights.FullControl,
                    InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit,
                    PropagationFlags.None,
                    AccessControlType.Allow
                ));
                security.AddAccessRule(new FileSystemAccessRule(
                    systemSid,
                    FileSystemRights.FullControl,
                    InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit,
                    PropagationFlags.None,
                    AccessControlType.Allow
                ));

                Directory.CreateDirectory(tempDir, security);

                // Read back and rigorously verify ACL
                var di = new DirectoryInfo(tempDir);
                var verifiedSecurity = di.GetAccessControl();
                if (!verifiedSecurity.AreAccessRulesProtected)
                {
                    throw new UnauthorizedAccessException("Failed to disable inheritance on secure temporary directory.");
                }

                int userRuleCount = 0;
                int systemRuleCount = 0;
                int totalRuleCount = 0;

                foreach (AuthorizationRule rule in verifiedSecurity.GetAccessRules(true, true, typeof(SecurityIdentifier)))
                {
                    totalRuleCount++;
                    var accessRule = rule as FileSystemAccessRule;
                    if (accessRule == null)
                    {
                        throw new UnauthorizedAccessException("Non-file system access rule detected in temporary directory security descriptor.");
                    }

                    if (accessRule.IsInherited)
                    {
                        throw new UnauthorizedAccessException("Inherited access rule detected on secure temporary directory.");
                    }

                    if (accessRule.AccessControlType != AccessControlType.Allow)
                    {
                        throw new UnauthorizedAccessException(string.Format("Non-allow access rule type detected ({0}) on secure temporary directory.", accessRule.AccessControlType));
                    }

                    if ((accessRule.InheritanceFlags & (InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit)) != (InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit))
                    {
                        throw new UnauthorizedAccessException("Incorrect or missing inheritance flags on temporary directory access rule.");
                    }

                    if (accessRule.PropagationFlags != PropagationFlags.None)
                    {
                        throw new UnauthorizedAccessException("Unexpected propagation flags on temporary directory access rule.");
                    }

                    bool isUser = accessRule.IdentityReference.Equals(currentUser);
                    bool isSystem = accessRule.IdentityReference.Equals(systemSid);

                    if (!isUser && !isSystem)
                    {
                        throw new UnauthorizedAccessException(string.Format("Unexpected identity reference in temporary directory ACL: {0}", accessRule.IdentityReference.Value));
                    }

                    if (accessRule.FileSystemRights != FileSystemRights.FullControl)
                    {
                        throw new UnauthorizedAccessException(string.Format("Unexpected permissions ({0}) for identity {1} on temporary directory; exactly FullControl required.", accessRule.FileSystemRights, accessRule.IdentityReference.Value));
                    }

                    if (isUser) userRuleCount++;
                    if (isSystem) systemRuleCount++;
                }

                if (totalRuleCount != 2 || userRuleCount != 1 || systemRuleCount != 1)
                {
                    throw new UnauthorizedAccessException(string.Format("Unexpected ACL rule counts on temporary directory (Total: {0}, UserRules: {1}, SystemRules: {2}); exactly 2 rules (1 user, 1 system) required.", totalRuleCount, userRuleCount, systemRuleCount));
                }

                var resources = new Dictionary<string, string>
                {
                    { "SentrixProvisioner.Resources.provisioner.ps1", "provisioner.ps1" },
                    { "SentrixProvisioner.Resources.provisioner-config.json", "provisioner-config.json" },
                    { "SentrixProvisioner.Resources.remove-sentrix.ps1", "remove-sentrix.ps1" }
                };

                foreach (var kvp in resources)
                {
                    string resourceName = kvp.Key;
                    string fileName = kvp.Value;
                    string targetPath = Path.Combine(tempDir, fileName);

                    using (Stream stream = assembly.GetManifestResourceStream(resourceName))
                    {
                        if (stream == null)
                        {
                            throw new FileNotFoundException(string.Format("Embedded resource not found: {0}", resourceName));
                        }

                        using (StreamReader reader = new StreamReader(stream, Encoding.UTF8))
                        {
                            string content = reader.ReadToEnd();
                            File.WriteAllText(targetPath, content, Encoding.UTF8);
                        }
                    }

                    if (!File.Exists(targetPath) || new FileInfo(targetPath).Length == 0)
                    {
                        throw new IOException(string.Format("Failed to extract or verify resource: {0}", fileName));
                    }
                }

                return tempDir;
            }
            catch (Exception ex)
            {
                AppendOutput(string.Format("[ERROR] Extraction failed: {0}", ex.Message), Color.Red);
                if (!string.IsNullOrEmpty(tempDir) && Directory.Exists(tempDir))
                {
                    try
                    {
                        Directory.Delete(tempDir, true);
                    }
                    catch (Exception delEx)
                    {
                        AppendOutput(string.Format("[WARN] Failed to delete temporary directory '{0}': {1}. Sensitive extracted files may remain.", tempDir, delEx.Message), Color.Yellow);
                    }
                }
                return null;
            }
        }

        private void RunPowerShellScript(string scriptPath, string workingDirectory)
        {
            ProcessStartInfo psi = new ProcessStartInfo
            {
                FileName = "powershell.exe",
                Arguments = string.Format("-NoProfile -ExecutionPolicy Bypass -File \"{0}\"", scriptPath),
                WorkingDirectory = workingDirectory,
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
                    AppendOutput(string.Format("\n[ERROR] Process exited with code {0}", process.ExitCode), Color.Red);
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
                closeButton.Text = string.Format("Close ({0})", autoCloseSeconds);
            }
            else
            {
                autoCloseTimer.Stop();
                this.Close();
            }
        }
    }
}
