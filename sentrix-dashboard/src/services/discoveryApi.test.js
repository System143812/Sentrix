import { describe, it, expect, vi, beforeEach } from 'vitest';
import { scanNetwork, getDiscoverySnapshot, deployAgent } from './discoveryApi.js';

global.fetch = vi.fn();

describe('discoveryApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('scanNetwork calls /api/discovery/scan', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, data: { status: 'scanning' } })
    });

    const result = await scanNetwork();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/discovery/scan'), expect.any(Object));
    expect(result.status).toBe('scanning');
  });

  it('getDiscoverySnapshot calls /api/discovery', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, data: { devices: [] } })
    });

    const result = await getDiscoverySnapshot();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/discovery'), expect.any(Object));
    expect(result.devices).toEqual([]);
  });

  it('deployAgent calls /api/discovery/deploy with POST', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, data: { success: true } })
    });

    const result = await deployAgent('127.0.0.1', 'PC', { user: 'a', pass: 'p' }, 'deploy');
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/discovery/deploy'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ ip: '127.0.0.1', device_type: 'PC', credentials: { user: 'a', pass: 'p' }, action: 'deploy' })
      })
    );
    expect(result.success).toBe(true);
  });
});
