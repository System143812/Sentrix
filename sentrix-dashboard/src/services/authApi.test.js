import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as authApi from './authApi.js';

global.fetch = vi.fn();

describe('authApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('login calls /api/auth/login and sets token', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, data: { user: { id: 1 }, token: 'abc' } })
    });

    const result = await authApi.login('t@t.com', 'p');
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/auth/login'), expect.objectContaining({ method: 'POST' }));
    expect(localStorage.getItem('sentrix_auth_token')).toBe('abc');
    expect(result.id).toBe(1);
  });

  it('logout calls /api/auth/logout and clears token', async () => {
    localStorage.setItem('sentrix_auth_token', 'abc');
    fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true })
    });

    await authApi.logout();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/auth/logout'), expect.any(Object));
    expect(localStorage.getItem('sentrix_auth_token')).toBeNull();
  });

  it('getCurrentUser returns null if no token', async () => {
    const user = await authApi.getCurrentUser();
    expect(user).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});
