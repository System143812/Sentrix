import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as clientApi from './clientApi.js';

global.fetch = vi.fn();

describe('clientApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('getClients calls /api/clients', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, data: { clients: [{ id: '1' }] } })
    });

    const result = await clientApi.getClients();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/clients'), expect.any(Object));
    expect(result).toHaveLength(1);
  });

  it('getClientMetrics includes range and limit params', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, data: [] })
    });

    await clientApi.getClientMetrics('1', { range: '1h', limit: 10 });
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('range=1h'), expect.any(Object));
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('limit=10'), expect.any(Object));
  });

  it('updatePeripheralStatus calls correct PATCH endpoint', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, data: { name: 'M' } })
    });

    await clientApi.updatePeripheralStatus('1', 'mouse key', 'resolve', 'fixed');
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/clients/1/peripherals/mouse%20key/resolve'),
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ note: 'fixed' })
      })
    );
  });

  it('killClientProcess calls POST endpoint', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true })
    });

    await clientApi.killClientProcess('1', 123);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/clients/1/processes/123/kill'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('sendDeviceCommand calls POST endpoint', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true })
    });

    await clientApi.sendDeviceCommand('1', 'restart', { force: true });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/clients/1/command'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ command: 'restart', payload: { force: true } })
      })
    );
  });
});
