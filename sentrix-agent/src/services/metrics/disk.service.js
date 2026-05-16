import os from "os";
import si from "systeminformation";
import { collectSafely, safeString, toNumber } from "./helpers.js";

function pickPrimaryDisk(disks = []) {
  if (!Array.isArray(disks) || disks.length === 0) {
    return null;
  }

  const systemDriveLetter = process.platform === "win32"
    ? safeString(process.env.SystemDrive, "C:").toLowerCase()
    : "/";

  return disks.find((disk) => {
    const mount = safeString(disk.mount, "").toLowerCase();
    return mount.startsWith(systemDriveLetter);
  }) || disks[0];
}

export async function collectDiskMetrics() {
  return collectSafely(async () => {
    const disks = await si.fsSize();
    const primaryDisk = pickPrimaryDisk(disks);

    return {
      usage: toNumber(primaryDisk?.use),
      totalBytes: toNumber(primaryDisk?.size),
      usedBytes: toNumber(primaryDisk?.used),
      freeBytes: toNumber(primaryDisk?.available),
      mount: safeString(primaryDisk?.mount, os.platform() === "win32" ? "C:\\" : "/"),
      filesystem: safeString(primaryDisk?.fs),
    };
  }, {
    usage: null,
    totalBytes: null,
    usedBytes: null,
    freeBytes: null,
    mount: os.platform() === "win32" ? "C:\\" : "/",
    filesystem: "Unknown",
  });
}
