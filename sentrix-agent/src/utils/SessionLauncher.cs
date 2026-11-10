using System;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Text;

namespace Sentrix.Launcher
{
    class Program
    {
        [DllImport("wtsapi32.dll", SetLastError = true)]
        static extern bool WTSQueryUserToken(int sessionId, out IntPtr hToken);

        [DllImport(
            "advapi32.dll",
            SetLastError = true,
            CharSet = CharSet.Unicode,
            ExactSpelling = true)]
        static extern bool CreateProcessAsUserW(
            IntPtr hToken,
            string lpApplicationName,
            StringBuilder lpCommandLine,
            IntPtr lpProcessAttributes,
            IntPtr lpThreadAttributes,
            bool bInheritHandles,
            uint dwCreationFlags,
            IntPtr lpEnvironment,
            string lpCurrentDirectory,
            ref STARTUPINFO lpStartupInfo,
            out PROCESS_INFORMATION lpProcessInformation
        );

        [DllImport("userenv.dll", SetLastError = true)]
        static extern bool CreateEnvironmentBlock(out IntPtr lpEnvironment, IntPtr hToken, bool bInherit);

        [DllImport("userenv.dll", SetLastError = true)]
        static extern bool DestroyEnvironmentBlock(IntPtr lpEnvironment);

        [DllImport("kernel32.dll", SetLastError = true)]
        static extern bool CloseHandle(IntPtr hObject);

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        public struct STARTUPINFO
        {
            public Int32 cb;
            public string lpReserved;
            public string lpDesktop;
            public string lpTitle;
            public Int32 dwX;
            public Int32 dwY;
            public Int32 dwXSize;
            public Int32 dwYSize;
            public Int32 dwXCountChars;
            public Int32 dwYCountChars;
            public Int32 dwFillAttribute;
            public Int32 dwFlags;
            public Int16 wShowWindow;
            public Int16 wReserved2;
            public IntPtr lpReserved2;
            public IntPtr hStdInput;
            public IntPtr hStdOutput;
            public IntPtr hStdError;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct PROCESS_INFORMATION
        {
            public IntPtr hProcess;
            public IntPtr hThread;
            public int dwProcessId;
            public int dwThreadId;
        }

        static bool IsFullyQualifiedPath(string path)
        {
            if (string.IsNullOrEmpty(path) || !Path.IsPathRooted(path))
                return false;

            string root = Path.GetPathRoot(path);

            // Drive-qualified path: C:\...
            if (root != null &&
                root.Length == 3 &&
                char.IsLetter(root[0]) &&
                root[1] == ':' &&
                (root[2] == '\\' || root[2] == '/'))
            {
                return true;
            }

            // UNC path: \\server\share\...
            if (root != null &&
                root.StartsWith(@"\\", StringComparison.Ordinal) &&
                !root.StartsWith(@"\\?\", StringComparison.Ordinal) &&
                !root.StartsWith(@"\\.\", StringComparison.Ordinal))
            {
                string[] uncParts = root.Trim('\\').Split('\\');

                if (uncParts.Length >= 2 &&
                    !string.IsNullOrWhiteSpace(uncParts[0]) &&
                    !string.IsNullOrWhiteSpace(uncParts[1]))
                {
                    return true;
                }
            }

            return false;
        }

        static string QuoteWindowsArgument(string argument)
        {
            if (argument == null)
            {
                throw new ArgumentNullException("argument");
            }

            var result = new StringBuilder();
            result.Append('"');

            int backslashes = 0;

            foreach (char c in argument)
            {
                if (c == '\\')
                {
                    backslashes++;
                }
                else if (c == '"')
                {
                    result.Append('\\', backslashes * 2 + 1);
                    result.Append('"');
                    backslashes = 0;
                }
                else
                {
                    result.Append('\\', backslashes);
                    result.Append(c);
                    backslashes = 0;
                }
            }

            // Backslashes immediately before the closing quote must be doubled.
            result.Append('\\', backslashes * 2);
            result.Append('"');

            return result.ToString();
        }

        static int Main(string[] args)
        {
            if (args.Length < 2)
            {
                Console.Error.WriteLine("Usage: SessionLauncher.exe <sessionId> <executablePath> [arguments]");
                return 1;
            }

            int sessionId;
            if (!int.TryParse(args[0], out sessionId) || sessionId < 0)
            {
                Console.Error.WriteLine(string.Format("Error: Invalid session ID '{0}'. Must be a non-negative integer.", args[0]));
                return 6;
            }

            string exePath = args[1];
            if (!IsFullyQualifiedPath(exePath) || !File.Exists(exePath))
            {
                Console.Error.WriteLine(string.Format("Error: Executable path '{0}' must be fully qualified and exist on disk.", exePath));
                return 7;
            }

            var commandLine = new StringBuilder();
            commandLine.Append(QuoteWindowsArgument(exePath));

            for (int i = 2; i < args.Length; i++)
            {
                commandLine.Append(' ');
                commandLine.Append(QuoteWindowsArgument(args[i]));
            }

            IntPtr hToken = IntPtr.Zero;
            IntPtr lpEnvironment = IntPtr.Zero;

            try
            {
                if (!WTSQueryUserToken(sessionId, out hToken))
                {
                    int errCode = Marshal.GetLastWin32Error();
                    string errMsg = new Win32Exception(errCode).Message;
                    Console.Error.WriteLine(string.Format("WTSQueryUserToken failed with error {0}: {1}", errCode, errMsg));
                    return 2;
                }

                if (!CreateEnvironmentBlock(out lpEnvironment, hToken, false))
                {
                    int errCode = Marshal.GetLastWin32Error();
                    string errMsg = new Win32Exception(errCode).Message;
                    Console.Error.WriteLine(string.Format("CreateEnvironmentBlock failed with error {0}: {1}", errCode, errMsg));
                    return 3;
                }

                STARTUPINFO si = new STARTUPINFO();
                si.cb = Marshal.SizeOf(si);
                si.lpDesktop = "winsta0\\default";

                PROCESS_INFORMATION pi = new PROCESS_INFORMATION();
                pi.hProcess = IntPtr.Zero;
                pi.hThread = IntPtr.Zero;

                uint CREATE_UNICODE_ENVIRONMENT = 0x00000400;
                uint DETACHED_PROCESS = 0x00000008;

                string workDir = Path.GetDirectoryName(exePath);

                try
                {
                    if (!CreateProcessAsUserW(
                        hToken,
                        exePath,
                        commandLine,
                        IntPtr.Zero,
                        IntPtr.Zero,
                        false,
                        CREATE_UNICODE_ENVIRONMENT | DETACHED_PROCESS,
                        lpEnvironment,
                        workDir,
                        ref si,
                        out pi
                    ))
                    {
                        int errCode = Marshal.GetLastWin32Error();
                        string errMsg = new Win32Exception(errCode).Message;
                        Console.Error.WriteLine(string.Format("CreateProcessAsUserW failed with error {0}: {1}", errCode, errMsg));
                        return 4;
                    }

                    Console.WriteLine(string.Format("SUCCESS: Helper launched in session {0} with PID {1}", sessionId, pi.dwProcessId));
                    return 0;
                }
                finally
                {
                    if (pi.hProcess != IntPtr.Zero && pi.hProcess != new IntPtr(-1))
                    {
                        CloseHandle(pi.hProcess);
                    }
                    if (pi.hThread != IntPtr.Zero && pi.hThread != new IntPtr(-1))
                    {
                        CloseHandle(pi.hThread);
                    }
                }
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine(string.Format("Exception: {0}", ex.Message));
                return 5;
            }
            finally
            {
                if (lpEnvironment != IntPtr.Zero) DestroyEnvironmentBlock(lpEnvironment);
                if (hToken != IntPtr.Zero) CloseHandle(hToken);
            }
        }
    }
}
