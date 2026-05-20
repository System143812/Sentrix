param (
    [string]$DllPath = "..\..\..\bin\hardware\LibreHardwareMonitorLib.dll"
)

$ErrorActionPreference = "Stop"

try {
    # Resolve absolute path to the DLL
    $PSScriptDir = $PSScriptRoot
    if (-not $PSScriptDir) {
        $PSScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition -ErrorAction SilentlyContinue
    }
    if (-not $PSScriptDir) {
        $PSScriptDir = (Get-Item .).FullName
    }
    
    $ResolvedDllPath = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($PSScriptDir, $DllPath))

    $IsAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")

    if (-not (Test-Path $ResolvedDllPath)) {
        @{
            cpu = @{ temperatureCelsius = $null }
            gpu = @{ model = "Unknown"; temperatureCelsius = $null }
            info = "DLL not found at $ResolvedDllPath"
            isAdmin = $IsAdmin
        } | ConvertTo-Json
        exit
    }

    # Load the Assembly
    Add-Type -Path $ResolvedDllPath

    # Initialize the Computer object
    $Computer = New-Object LibreHardwareMonitor.Hardware.Computer
    $Computer.IsCpuEnabled = $true
    $Computer.IsGpuEnabled = $true
    $Computer.IsMotherboardEnabled = $true
    $Computer.IsStorageEnabled = $true
    $Computer.IsMemoryEnabled = $true
    $Computer.IsNetworkEnabled = $true
    
    # Safer property setting for older library versions
    try { $Computer.IsSuperIOEnabled = $true } catch {}
    try { $Computer.IsControllerEnabled = $true } catch {}
    
    $Computer.Open()

    # POLLING: Try multiple times to "wake up" sensors on older hardware
    for ($i = 0; $i -lt 3; $i++) {
        foreach ($Hardware in $Computer.Hardware) {
            $Hardware.Update()
        }
        Start-Sleep -Milliseconds 300
    }

    $Results = @{
        cpu = @{ temperatureCelsius = $null }
        gpu = @{ model = "Unknown"; temperatureCelsius = $null }
        info = "Collection complete"
        isAdmin = $IsAdmin
        debug = @{
            hardwareCount = 0
            sensorCount = 0
            sensorTypes = @{}
            hardwareDetails = @()
        }
    }

    foreach ($Hardware in $Computer.Hardware) {
        $Results.debug.hardwareCount++
        $hwName = $Hardware.Name
        $hwType = $Hardware.HardwareType.ToString()
        $hwTempSensors = @()
        
        foreach ($Sensor in $Hardware.Sensors) {
            $Results.debug.sensorCount++
            $typeStr = $Sensor.SensorType.ToString()
            if ($null -eq $Results.debug.sensorTypes[$typeStr]) {
                $Results.debug.sensorTypes[$typeStr] = 1
            } else {
                $Results.debug.sensorTypes[$typeStr]++
            }

            if ($Sensor.SensorType -eq "Temperature") {
                $valStr = if ($null -eq $Sensor.Value) { "NULL" } else { $Sensor.Value.ToString() }
                $hwTempSensors += "$($Sensor.Name): $valStr"
            }
            
            # CPU Detection
            if ($hwType -eq "Cpu") {
                if ($Sensor.SensorType -eq "Temperature" -and $null -ne $Sensor.Value -and $Sensor.Value -gt 0) {
                    if ($Sensor.Name -like "*Package*" -or $Sensor.Name -like "*Average*") {
                        $Results.cpu.temperatureCelsius = [Math]::Round($Sensor.Value, 1)
                    }
                    elseif ($null -eq $Results.cpu.temperatureCelsius -and $Sensor.Name -like "*Core*") {
                        $Results.cpu.temperatureCelsius = [Math]::Round($Sensor.Value, 1)
                    }
                }
            }

            # GPU Detection
            if ($hwType -like "*Gpu*") {
                $Results.gpu.model = $hwName
                if ($Sensor.SensorType -eq "Temperature" -and $null -ne $Sensor.Value -and $Sensor.Value -gt 0) {
                    $Results.gpu.temperatureCelsius = [Math]::Round($Sensor.Value, 1)
                }
            }

            # Storage Fallback for CPU Temp (Some laptops report CPU temp under storage controllers or generic sensors)
            if ($null -eq $Results.cpu.temperatureCelsius -and $Sensor.SensorType -eq "Temperature" -and $null -ne $Sensor.Value -and $Sensor.Value -gt 10) {
                if ($Sensor.Name -like "*CPU*" -or $Sensor.Name -like "*Processor*") {
                    $Results.cpu.temperatureCelsius = [Math]::Round($Sensor.Value, 1)
                }
            }
        }

        if ($hwTempSensors.Count -gt 0) {
            $Results.debug.hardwareDetails += "$hwName ($hwType) -> Sensors: $($hwTempSensors -join ', ')"
        }
    }

    $Computer.Close()

    if ($Results.cpu.temperatureCelsius -eq $null -and $Results.gpu.temperatureCelsius -eq $null) {
        $foundTypes = $Results.debug.sensorTypes.Keys -join ", "
        $Results.info = "No temperature sensors found via LHM. Hardware Count: $($Results.debug.hardwareCount). Sensor Types seen: $foundTypes"
    }

    # FALLBACK: If library failed, try Windows Native (ThermalZones)
    if ($null -eq $Results.cpu.temperatureCelsius) {
        # Method 1: root\wmi (MSAcpi_ThermalZoneTemperature)
        try {
            $wmicTemp = Get-WmiObject -Namespace "root\wmi" -Class "MSAcpi_ThermalZoneTemperature" -ErrorAction SilentlyContinue
            if ($wmicTemp) {
                $raw = $wmicTemp.CurrentTemperature
                if ($raw -gt 0) {
                    $Results.cpu.temperatureCelsius = [Math]::Round(($raw / 10 - 273.15), 1)
                    $Results.info += " (Using WMI-ACPI Fallback)"
                }
            }
        } catch {}

        # Method 2: root\cimv2 (Win32_TemperatureProbe) - Rare but worth a check
        if ($null -eq $Results.cpu.temperatureCelsius) {
            try {
                $probeTemp = Get-WmiObject -Class "Win32_TemperatureProbe" -ErrorAction SilentlyContinue
                if ($probeTemp -and $probeTemp.CurrentReading -gt 0) {
                    $Results.cpu.temperatureCelsius = $probeTemp.CurrentReading
                    $Results.info += " (Using WMI-Probe Fallback)"
                }
            } catch {}
        }
    }

    # Output as JSON for Node.js to consume
    $Results | ConvertTo-Json
}
catch {
    @{
        cpu = @{ temperatureCelsius = $null }
        gpu = @{ model = "Unknown"; temperatureCelsius = $null }
        error = $_.Exception.Message
        isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")
    } | ConvertTo-Json
}
