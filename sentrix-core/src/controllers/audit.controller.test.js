import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import auditRouter from '../routes/audit.route.js';
import * as auditService from '../services/audit.service.js';
import { errorHandler } from '../middlewares/error.middleware.js';

vi.mock('../services/audit.service.js');
vi.mock('../middlewares/auth.middleware.js', () => ({
  authenticate: (req, res, next) => next(),
  requireRole: () => (req, res, next) => next()
}));

const app = express();
app.use(express.json());
app.use('/api/audit', auditRouter);
app.use(errorHandler);

describe('Audit Controller', () => {
  it('GET /api/audit', async () => {
    auditService.getAuditLogs.mockResolvedValue([{ action: 'login' }]);
    const res = await request(app).get('/api/audit');
    expect(res.status).toBe(200);
  });
});
