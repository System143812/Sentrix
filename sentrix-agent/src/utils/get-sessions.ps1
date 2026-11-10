Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Collections.Generic;
using System.ComponentModel;

public class WtsSessionEnumerator {
    [DllImport("wtsapi32.dll", SetLastError = true, CharSet = CharSet.Unicode, EntryPoint = "WTSEnumerateSessionsW")]
    public static extern bool WTSEnumerateSessions(
        IntPtr hServer, int Reserved, int Version, ref IntPtr ppSessionInfo, ref int pCount
    );

    [DllImport("wtsapi32.dll")]
    public static extern void WTSFreeMemory(IntPtr pMemory);

    [StructLayout(LayoutKind.Sequential)]
    public struct WTS_SESSION_INFO {
        public int SessionId;
        public IntPtr pWinStationName;
        public int State;
    }

    public static List<Dictionary<string, object>> GetSessions() {
        List<Dictionary<string, object>> list = new List<Dictionary<string, object>>();
        IntPtr ppSessionInfo = IntPtr.Zero;
        int count = 0;
        if (!WTSEnumerateSessions(IntPtr.Zero, 0, 1, ref ppSessionInfo, ref count)) {
            int err = Marshal.GetLastWin32Error();
            throw new Win32Exception(err, "WTSEnumerateSessionsW failed with win32 error code " + err);
        }
        try {
            IntPtr current = ppSessionInfo;
            int dataSize = Marshal.SizeOf(typeof(WTS_SESSION_INFO));
            for (int i = 0; i < count; i++) {
                WTS_SESSION_INFO si = (WTS_SESSION_INFO)Marshal.PtrToStructure(current, typeof(WTS_SESSION_INFO));
                Dictionary<string, object> dict = new Dictionary<string, object>();
                dict["SessionId"] = si.SessionId;
                dict["WinStationName"] = Marshal.PtrToStringUni(si.pWinStationName);
                dict["State"] = si.State;
                list.Add(dict);
                current = IntPtr.Add(current, dataSize);
            }
        } finally {
            if (ppSessionInfo != IntPtr.Zero) {
                WTSFreeMemory(ppSessionInfo);
            }
        }
        return list;
    }
}
'@ -ErrorAction Stop

[WtsSessionEnumerator]::GetSessions() | ConvertTo-Json -Compress
