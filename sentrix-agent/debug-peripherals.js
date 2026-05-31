import { execFile } from "child_process";
import { promisify } from "util";
import { collectUsbDevices } from './src/services/metrics/peripherals.service.js';

const execFileAsync = promisify(execFile);

async function run() {
  console.log("--- 1. RAW DATA FROM WINDOWS (Get-PnpDevice) ---");
  try {
    const script = `
      $ProgressPreference = 'SilentlyContinue'
      $devs = Get-PnpDevice -PresentOnly | Where-Object { 
        $_.InstanceId -match '^USB|^BTHENUM|^DISPLAY|^HID' -and $_.ConfigManagerErrorCode -eq 0
      }
      if ($devs) {
        $props = Get-PnpDeviceProperty -InstanceId $devs.InstanceId -KeyName 'DEVPKEY_Device_InLocalMachineContainer' -ErrorAction SilentlyContinue
        $propMap = @{}
        foreach ($p in $props) { 
          if ($p.InstanceId) { $propMap[$p.InstanceId] = [bool]$p.Data }
        }
        $results = foreach ($dev in $devs) {
          $val = $propMap[$dev.InstanceId]
          [PSCustomObject]@{
            FriendlyName = $dev.FriendlyName
            InstanceId = $dev.InstanceId
            Class = $dev.Class
            Service = $dev.Service
            Manufacturer = $dev.Manufacturer
            IsBuiltIn = if ($null -ne $val) { $val } else { $false }
          }
        }
        $results | ConvertTo-Json -Compress
      } else { "[]" }
    `.trim();

    const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-Command", script], {
      timeout: 15000,
      windowsHide: true,
    });

    const raw = JSON.parse(stdout);
    console.log(JSON.stringify(raw, null, 2));
  } catch (err) {
    console.error("Error fetching raw data:", err);
  }

  console.log("\n--- 2. FINAL PROCESSED INVENTORY (The Shield Applied) ---");
  try {
    const processed = await collectUsbDevices();
    console.log(JSON.stringify(processed, null, 2));
    console.log(`\nTotal Processed Devices: ${processed.length}`);
  } catch (err) {
    console.error("Error fetching processed data:", err);
  }
}

run();
