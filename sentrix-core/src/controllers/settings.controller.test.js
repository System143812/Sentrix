import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import settingsRouter from '../routes/settings.route.js';
import * as settingsService from '../services/settings.service.js';
import * as pruningService from '../services/pruning.service.js';
import { errorHandler } from '../middlewares/error.middleware.js';

vi.mock('../services/settings.service.js');
vi.mock('../services/audit.service.js');
vi.mock('../services/pruning.service.js');
vi.mock('../middlewares/auth.middleware.js', () => ({
  authenticate: (req, res, next) => {
    req.user = { id: 1 };
    next();
  },
  requireRole: () => (req, res, next) => next()
}));

const app = express();
app.use(express.json());
app.use('/api/settings', settingsRouter);
app.use(errorHandler);

describe('Settings Controller (Full Coverage)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET /api/settings/telemetry', async () => {
    settingsService.getTelemetrySettings.mockResolvedValue({ intervalMs: 5000 });
    const res = await request(app).get('/api/settings/telemetry');
    expect(res.status).toBe(200);
    expect(res.body.data.intervalMs).toBe(5000);
  });

  it('PATCH /api/settings/telemetry', async () => {
    settingsService.updateTelemetrySettings.mockResolvedValue({ intervalMs: 10000 });
    const res = await request(app).patch('/api/settings/telemetry').send({ intervalMs: 10000 });
    expect(res.status).toBe(200);
    expect(res.body.data.intervalMs).toBe(10000);
  });

  it('GET /api/settings/pruning', async () => {
    settingsService.getPruningSettings.mockResolvedValue({ retentionDays: 30 });
    const res = await request(app).get('/api/settings/pruning');
    expect(res.status).toBe(200);
    expect(res.body.data.retentionDays).toBe(30);
  });

  it('PATCH /api/settings/pruning', async () => {
    settingsService.updatePruningSettings.mockResolvedValue({ retentionDays: 60 });
    const res = await request(app).patch('/api/settings/pruning').send({ retentionDays: 60 });
    expect(res.status).toBe(200);
    expect(res.body.data.retentionDays).toBe(60);
    expect(pruningService.startPruningService).toHaveBeenCalled();
  });

  it('POST /api/settings/pruning/trigger', async () => {
    pruningService.runPruneSweep.mockResolvedValue(100);
    const res = await request(app).post('/api/settings/pruning/trigger');
    expect(res.status).toBe(200);
    expect(res.body.data.deletedCount).toBe(100);
  });

  it('GET /api/settings/utilities', async () => {
    settingsService.getUtilitySettings.mockResolvedValue({ enabledIds: ['taskmgr'] });
    const res = await request(app).get('/api/settings/utilities');
    expect(res.status).toBe(200);
    expect(res.body.data.enabledIds).toContain('taskmgr');
  });

  it('PATCH /api/settings/utilities', async () => {
    settingsService.updateUtilitySettings.mockResolvedValue({ enabledIds: ['regedit'] });
    const res = await request(app).patch('/api/settings/utilities').send({ enabledIds: ['regedit'] });
    expect(res.status).toBe(200);
    expect(res.body.data.enabledIds).toContain('regedit');
  });
});
