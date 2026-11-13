import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ScreenCaptureService } from './screen.service.js';
import screenshot from 'screenshot-desktop';

vi.mock('screenshot-desktop', () => ({
  default: vi.fn(),
}));

describe('ScreenCaptureService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should initialize with default settings and stopped state', () => {
    const service = new ScreenCaptureService({ onFrame: () => {} });
    const status = service.status();

    expect(status.isCapturing).toBe(false);
    expect(status.fps).toBe(2);
    expect(status.quality).toBe(60);
  });

  it('should start capturing and emit frames at the specified interval', async () => {
    const mockBuffer = Buffer.from('fake-jpeg-data');
    screenshot.mockResolvedValue(mockBuffer);

    const onFrame = vi.fn();
    const service = new ScreenCaptureService({ onFrame });

    service.start({ fps: 2, quality: 70 });
    expect(service.status().isCapturing).toBe(true);
    expect(service.status().fps).toBe(2);
    expect(service.status().quality).toBe(70);

    // Fast-forward time to trigger interval (1000ms / 2 = 500ms)
    await vi.advanceTimersByTimeAsync(500);

    expect(screenshot).toHaveBeenCalledWith({ format: 'jpeg', quality: 70 });
    expect(onFrame).toHaveBeenCalledWith(mockBuffer);

    service.stop();
    expect(service.status().isCapturing).toBe(false);
  });
});
