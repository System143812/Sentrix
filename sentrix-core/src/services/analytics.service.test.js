import { describe, it, expect, vi } from 'vitest';
import * as analyticsService from './analytics.service.js';
import pool from '../lib/database.js';

vi.mock('../lib/database.js', () => ({
  default: {
    query: vi.fn()
  }
}));

vi.mock('./client.services.js', () => ({
  getAllClients: vi.fn().mockResolvedValue([
    { id: '1', hostname: 'PC-1', status: 'online', metrics: { cpu: 10, ram: 20, disk: 30 } }
  ])
}));

vi.mock('./metrics/index.js', () => ({
  getGlobalTrendData: vi.fn().mockResolvedValue([])
}));

describe('Professional Analytics Exports', () => {
  it('should generate a valid CSV string', async () => {
    pool.query.mockResolvedValueOnce([[]]); // inventory
    pool.query.mockResolvedValueOnce([[]]); // hardware profiles
    
    const csv = await analyticsService.getAnalyticsCsv();
    expect(typeof csv).toBe('string');
    expect(csv).toContain('Device Metrics');
    expect(csv).toContain('Connected Peripherals');
    expect(csv).toContain('Missing Peripherals');
  });

  it('should generate a PDF buffer', async () => {
    pool.query.mockResolvedValueOnce([[]]); // inventory
    pool.query.mockResolvedValueOnce([[]]); // hardware profiles

    const pdf = await analyticsService.getAnalyticsPdf();
    expect(pdf).toBeInstanceOf(Buffer);
    expect(pdf.length).toBeGreaterThan(0);
  }, 15000);

  it('should generate a DOCX buffer', async () => {
    pool.query.mockResolvedValueOnce([[]]); // inventory
    pool.query.mockResolvedValueOnce([[]]); // hardware profiles

    const docx = await analyticsService.getAnalyticsDocx();
    expect(docx).toBeInstanceOf(Buffer);
    expect(docx.length).toBeGreaterThan(0);
  }, 15000);
});
