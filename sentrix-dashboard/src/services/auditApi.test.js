import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as auditApi from './auditApi.js';

global.fetch = vi.fn();

describe('auditApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getAuditLogs calls /api/audit', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, data: [] })
    });
    await auditApi.getAuditLogs();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/audit'), expect.any(Object));
  });

  it('authorizeLogSubject calls POST endpoint', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, data: {} })
    });
    await auditApi.authorizeLogSubject(1, 'Reason');
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/audit/1/authorize'), expect.objectContaining({ method: 'POST' }));
  });

  it('revokeAuthority calls POST endpoint', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, data: {} })
    });
    await auditApi.revokeAuthority(1, 'Reason');
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/audit/authority/1/revoke'), expect.objectContaining({ method: 'POST' }));
  });
});
