import os from "os";
import { EventEmitter } from "events";
import { getPrimaryInterface } from "../modules/discovery/scanner.js";

class NetworkIdentityService extends EventEmitter {
  constructor() {
    super();
    const iface = getPrimaryInterface();
    this.currentIp = iface.ip || "127.0.0.1";
    this.currentMac = iface.mac || null;
    this.port = Number(process.env.PORT || 4000);
    this.timer = null;

    const hasUsableInfo = Boolean(iface.ip && iface.ip !== "127.0.0.1" && iface.mac);
    const isFallback = (this.currentIp === "127.0.0.1");
    const { url, source } = this.resolveServerUrlDetails();

    console.log(`[NetworkIdentity] Initialized: IP=${this.currentIp}, MAC=${this.currentMac || "none"}, usableNetworkInfo=${hasUsableInfo}, isFallback=${isFallback}`);
    console.log(`[NetworkIdentity] Initial Core URL: ${url} (source: ${source})`);
  }

  startPolling(intervalMs = 15000) {
    if (this.timer) return;
    console.log(`[NetworkIdentity] Starting polling with interval: ${intervalMs}ms`);
    this.timer = setInterval(() => {
      const iface = getPrimaryInterface();
      const detectedIp = iface.ip || "127.0.0.1";
      if (detectedIp !== this.currentIp && detectedIp !== "127.0.0.1") {
        const oldIp = this.currentIp;
        const oldMac = this.currentMac;
        this.currentIp = detectedIp;
        this.currentMac = iface.mac || this.currentMac;
        const { url: newUrl, source } = this.resolveServerUrlDetails();
        console.log(`[NetworkIdentity] IP change detected: oldIp=${oldIp}, newIp=${this.currentIp}, oldMac=${oldMac || "none"}, newMac=${this.currentMac || "none"}, newUrl=${newUrl}, source=${source}`);
        this.emit("ip-changed", { oldIp, newIp: this.currentIp, serverUrl: newUrl });
      }
    }, intervalMs);
  }

  stopPolling() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log(`[NetworkIdentity] Stopped polling.`);
    }
  }

  getCurrentIp() {
    return this.currentIp;
  }

  getCurrentMac() {
    return this.currentMac;
  }

  getServerUrl() {
    return this.resolveServerUrlDetails().url;
  }

  resolveServerUrlDetails() {
    const rawPublicUrl = process.env.BACKEND_URL || process.env.SENTRIX_PUBLIC_SERVER_URL;
    let source = "dynamic-interface-ip";
    let url;

    if (rawPublicUrl && !rawPublicUrl.startsWith("localhost") && !rawPublicUrl.startsWith("127.0.0.1")) {
      source = process.env.BACKEND_URL ? "BACKEND_URL" : "SENTRIX_PUBLIC_SERVER_URL";
      url = rawPublicUrl.startsWith("http") ? rawPublicUrl : `https://${rawPublicUrl}`;
    } else {
      url = `https://${this.currentIp}:${this.port}`;
    }
    return { url, source };
  }
}

export const networkIdentity = new NetworkIdentityService();
