import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import analyticsRouter from '../routes/analytics.route.js';
import * as analyticsService from '../services/analytics.service.js';
import { errorHandler } from '../middlewares/error.middleware.js';

vi.mock('../services/analytics.service.js');
vi.mock('../middlewares/auth.middleware.js', () => ({
  authenticate: (req, res, next) => next(),
  requireRole: () => (req, res, next) => next()
}));

const app = express();
app.use(express.json());
app.use('/api/analytics', analyticsRouter);
app.use(errorHandler);

describe('Analytics Controller', () => {
  it('GET /api/analytics/', async () => {
    analyticsService.getAnalyticsSummary.mockResolvedValue({ totalUsage: 100 });
    const res = await request(app).get('/api/analytics/');
    expect(res.status).toBe(200);
    expect(res.body.data.totalUsage).toBe(100);
  });

  it('GET /api/analytics/export.pdf', async () => {
    analyticsService.getAnalyticsPdf.mockResolvedValue(Buffer.from('pdf content'));
    const res = await request(app).get('/api/analytics/export.pdf');
    expect(res.status).toBe(200);
    expect(res.header['content-type']).toBe('application/pdf');
  });

  it('GET /api/analytics/export.csv', async () => {
    analyticsService.getAnalyticsCsv.mockResolvedValue('a,b,c');
    const res = await request(app).get('/api/analytics/export.csv');
    expect(res.status).toBe(200);
    expect(res.header['content-type']).toBe('text/csv; charset=utf-8');
  });
});
