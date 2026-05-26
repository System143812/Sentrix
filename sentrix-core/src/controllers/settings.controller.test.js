import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import settingsRouter from '../routes/settings.route.js';
import * as settingsService from '../services/settings.service.js';
import { errorHandler } from '../middlewares/error.middleware.js';

vi.mock('../services/settings.service.js');
vi.mock('../services/audit.service.js');
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

describe('Settings Controller', () => {
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
});
