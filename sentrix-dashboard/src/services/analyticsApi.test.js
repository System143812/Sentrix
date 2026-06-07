import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as analyticsApi from './analyticsApi.js';

global.fetch = vi.fn();
global.URL.createObjectURL = vi.fn();
global.URL.revokeObjectURL = vi.fn();

describe('analyticsApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getAnalytics calls /api/analytics', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, data: {} })
    });
    await analyticsApi.getAnalytics();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/analytics'), expect.any(Object));
  });

  it('downloadAnalyticsPdf calls /api/analytics/export.pdf', async () => {
    fetch.mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(['pdf'], { type: 'application/pdf' }))
    });
    // Mocking browser DOM side effects
    const spy = vi.spyOn(document.body, 'appendChild').mockImplementation(() => {});
    const spyClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    
    await analyticsApi.downloadAnalyticsPdf();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/analytics/export.pdf'), expect.any(Object));
    
    spy.mockRestore();
    spyClick.mockRestore();
  });

  it('downloadAnalyticsDocx calls /api/analytics/export.docx', async () => {
    fetch.mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(['docx'], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }))
    });
    const spy = vi.spyOn(document.body, 'appendChild').mockImplementation(() => {});
    const spyClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    await analyticsApi.downloadAnalyticsDocx();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/analytics/export.docx'), expect.any(Object));

    spy.mockRestore();
    spyClick.mockRestore();
  });
});
