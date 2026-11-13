import screenshot from "screenshot-desktop";

export class ScreenCaptureService {
  constructor({ onFrame, logger = console.log }) {
    this.onFrame = onFrame;
    this.logger = logger;
    this.intervalId = null;
    this.isCapturing = false;
    this.fps = 2; // Default 2 FPS
    this.quality = 60; // Default 60% JPEG quality
  }

  start({ fps = 2, quality = 60 } = {}) {
    if (this.isCapturing) {
      this.stop();
    }

    this.fps = Math.min(Math.max(Number(fps) || 2, 1), 5); // Enforce 1-5 FPS limits
    this.quality = Math.min(Math.max(Number(quality) || 60, 20), 90);
    this.isCapturing = true;

    const intervalMs = Math.floor(1000 / this.fps);
    this.logger(`[ScreenService] Starting screen capture stream at ${this.fps} FPS (~${intervalMs}ms interval, quality: ${this.quality}%)`);

    let capturingInProgress = false;

    this.intervalId = setInterval(async () => {
      if (!this.isCapturing || capturingInProgress) return;
      capturingInProgress = true;

      try {
        const imgBuffer = await screenshot({ format: 'jpeg', quality: this.quality });
        if (this.isCapturing && imgBuffer) {
          this.onFrame(imgBuffer);
        }
      } catch (err) {
        this.logger(`[ScreenService] Capture error: ${err.message}`);
      } finally {
        capturingInProgress = false;
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
