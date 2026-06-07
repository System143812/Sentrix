import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as groupApi from './groupApi.js';

global.fetch = vi.fn();

describe('groupApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getGroups calls /api/groups', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, data: [] })
    });
    await groupApi.getGroups();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/groups'), expect.any(Object));
  });

  it('createGroup calls POST endpoint', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, data: {} })
    });
    await groupApi.createGroup({ name: 'Lab' });
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/groups'), expect.objectContaining({ method: 'POST' }));
  });

  it('deleteGroup calls DELETE endpoint', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true })
    });
    await groupApi.deleteGroup(1);
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/groups/1'), expect.objectContaining({ method: 'DELETE' }));
  });
});
