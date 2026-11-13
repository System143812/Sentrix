import screenshot from "screenshot-desktop";
import { sendMessage } from "../utils/ipc.js";
import { getActiveSessionManager } from "./session-manager.js";

export class ScreenCaptureService {
  constructor({ onFrame, logger = console.log }) {
    this.onFrame = onFrame;
    this.logger = logger;
    this.intervalId = null;
    this.isCapturing = false;
    this.fps = 2; // Default 2 FPS
    this.quality = 720; // Default 720p resolution preset
  }

  mapQuality(qInput) {
    const num = Number(qInput) || 720;
    if (num <= 480 || num === 50) return 50;
    if (num <= 720 || num === 60 || num === 70) return 70;
    return 85;
  }

  async captureFrame() {
    const mappedQ = this.mapQuality(this.quality);

    // 1. Try helper running in interactive user session via IPC
    const manager = getActiveSessionManager();
    if (manager && manager.sessions) {
      for (const [sid, rec] of manager.sessions.entries()) {
        if (rec.port) {
          try {
            const res = await sendMessage(rec.port, { type: "get_screen_frame", quality: this.quality });
            if (res && res.success && res.frame) {
              return Buffer.from(res.frame, "base64");
            }
          } catch {}
        }
      }
    }

    // 2. Fallback to direct screenshot (if running directly in interactive user session / dev mode)
    try {
      const imgBuffer = await screenshot({ format: 'jpeg', quality: mappedQ });
      return imgBuffer;
    } catch (err) {
      throw err;
    }
  }

  start({ fps = 2, quality = 720 } = {}) {
    if (this.isCapturing) {
      this.stop();
    }

    this.fps = Math.min(Math.max(Number(fps) || 2, 1), 10); // Enforce 1-10 FPS limits
    this.quality = quality;
    this.isCapturing = true;

    const intervalMs = Math.max(Math.floor(1000 / this.fps), 80); // Min 80ms interval for stability
    this.logger(`[ScreenService] Starting screen capture stream at ${this.fps} FPS (~${intervalMs}ms interval, resolution: ${this.quality})`);

    this.intervalId = setInterval(async () => {
      if (!this.isCapturing) return;

      try {
        const imgBuffer = await this.captureFrame();
        if (this.isCapturing && imgBuffer) {
          this.onFrame(imgBuffer);
        }
      } catch (err) {
        this.logger(`[ScreenService] Capture error: ${err.message}`);
      }
    }, intervalMs);
  }

  stop() {
    if (!this.isCapturing) return;
    this.isCapturing = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.logger("[ScreenService] Stopped screen capture stream.");
  }

  status() {
    return {
      isCapturing: this.isCapturing,
      fps: this.fps,
      quality: this.quality
    };
  }
}
