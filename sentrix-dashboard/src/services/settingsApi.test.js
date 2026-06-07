import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as settingsApi from './settingsApi.js';

global.fetch = vi.fn();

describe('settingsApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getTelemetrySettings calls /api/settings/telemetry', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, data: {} })
    });
    await settingsApi.getTelemetrySettings();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/settings/telemetry'), expect.any(Object));
  });

  it('updateTelemetrySettings calls PATCH endpoint', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, data: {} })
    });
    await settingsApi.updateTelemetrySettings(1000);
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/settings/telemetry'), expect.objectContaining({ method: 'PATCH' }));
  });

  it('triggerPruning calls POST endpoint', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, data: {} })
    });
    await settingsApi.triggerPruning();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/settings/pruning/trigger'), expect.objectContaining({ method: 'POST' }));
  });
});
