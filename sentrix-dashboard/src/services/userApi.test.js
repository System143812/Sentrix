import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as userApi from './userApi.js';

global.fetch = vi.fn();

describe('userApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getUsers calls /api/users', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, data: [] })
    });
    await userApi.getUsers();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/users'), expect.any(Object));
  });

  it('createAdmin calls POST endpoint', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, data: {} })
    });
    await userApi.createAdmin('new@u.com', 'pass');
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/users'), expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ email: 'new@u.com', password: 'pass' })
    }));
  });
});
