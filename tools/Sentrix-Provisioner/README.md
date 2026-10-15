# Sentrix PC Provisioner

A modern, user-friendly Windows application that provisions PCs for Sentrix agent deployment.

## Features

- ✨ **Double-click to run** - No manual PowerShell navigation required
- 🔐 **Auto UAC elevation** - Automatically requests administrator rights
- 🎨 **Modern dark UI** - Matches Sentrix dashboard aesthetic
- 📊 **Real-time progress** - Visual progress bar with step-by-step updates
- 🎨 **Color-coded output** - Green for success, red for errors, yellow for warnings
- ⏱️ **Auto-close on success** - 5-second countdown after successful provisioning
- ❌ **Error handling** - Pauses on error so user can read the message

---

## Building the Application

### Prerequisites

You need ONE of the following:

1. **.NET Framework 4.8 Developer Pack** - [Download](https://dotnet.microsoft.com/download/dotnet-framework/net48)
2. **Visual Studio 2019/2022** (Community Edition is free)
3. **.NET Framework 4.0 (already on Windows)** - See option 3 below

---

### Option 1: Build with PowerShell Script (Easiest)

```powershell
cd C:\Users\Gabby\Desktop\Sentrix\Sentrix\tools\Sentrix-Provisioner
.\build.ps1
```

The compiled EXE will be in `dist\Sentrix-Provisioner.exe`

---

### Option 2: Build with Visual Studio

1. Open `Sentrix-Provisioner.csproj` in Visual Studio
2. Right-click the project → **Build**
3. Find the EXE in `bin\Release\Sentrix-Provisioner.exe`

---

### Option 3: Build with MSBuild Directly (No Developer Pack Needed)

If you're getting "reference assemblies not found" errors, use the .NET 4.0 target (already on Windows):

```powershell
# Use the MSBuild that comes with Windows
cd C:\Users\Gabby\Desktop\Sentrix\Sentrix\tools\Sentrix-Provisioner
C:\Windows\Microsoft.NET\Framework64\v4.0.30319\MSBuild.exe Sentrix-Provisioner.csproj /p:Configuration=Release /p:OutputPath=dist /p:TargetFrameworkVersion=v4.0
```

---

### Option 4: Use CSC Directly (Pure Command-Line Compilation)

If MSBuild isn't working, compile directly with the C# compiler:

```powershell
cd C:\Users\Gabby\Desktop\Sentrix\Sentrix\tools\Sentrix-Provisioner

# Compile
C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe `
  /out:dist\Sentrix-Provisioner.exe `
  /target:winexe `
  /win32icon:sentrix-icon.ico `
  /win32manifest:app.manifest `
  /resource:Resources\provisioner.ps1,SentrixProvisioner.Resources.provisioner.ps1 `
  /reference:System.dll `
  /reference:System.Core.dll `
  /reference:System.Drawing.dll `
  /reference:System.Windows.Forms.dll `
  /optimize+ `
  Program.cs `
  ProvisionerForm.cs
```

---

## Testing the Application

After building successfully:

1. **Navigate to:** `dist\Sentrix-Provisioner.exe`
2. **Double-click** the EXE
3. **UAC prompt** will appear → Click **Yes**
4. The provisioner will run automatically
5. On success: Auto-closes after 5 seconds
6. On error: Shows error and waits for manual close

---

## Troubleshooting

### "MSBuild not found"
- Install Visual Studio Build Tools
- Or use Option 4 (CSC direct compilation)

### "Reference assemblies not found"
- Install .NET Framework 4.8 Developer Pack
- Or change `TargetFrameworkVersion` in the .csproj to `v4.0`
- Or use Option 4 (CSC direct compilation)

### "Access Denied" when running
- Right-click → Run as Administrator
- Or the UAC manifest isn't embedded properly

---

## Project Structure

```
Sentrix-Provisioner/
├── Program.cs                 # Entry point
├── ProvisionerForm.cs         # Main UI form
├── Sentrix-Provisioner.csproj # MSBuild project file
├── app.manifest               # UAC elevation manifest
├── sentrix-icon.ico           # Sentrix logo icon
├── build.ps1                  # Build script
├── generate-icon.ps1          # Icon generator
└── Resources/
    └── provisioner.ps1        # Embedded PowerShell script
```

---

## Deployment

After building, distribute `Sentrix-Provisioner.exe` to lab technicians. They can:

1. Copy it to a USB drive
2. Copy to target PC
3. Double-click to provision
4. No PowerShell knowledge required!

---

## Version

- Target Framework: .NET Framework 4.0 (or 4.8 if Developer Pack installed)
- Platform: Windows 7/8/10/11
- Requires: Administrator privileges
