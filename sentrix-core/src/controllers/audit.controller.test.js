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

  it('GET /api/audit/authority', async () => {
    auditService.getBlockedSubjects.mockResolvedValue([{ identifier: '00:11:22:33:44:55' }]);
    const res = await request(app).get('/api/audit/authority');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('POST /api/audit/authority/:id/revoke', async () => {
    auditService.revokeAuthorityRecord.mockResolvedValue({ id: 1, subject_type: 'mac', identifier: 'test' });
    const res = await request(app)
      .post('/api/audit/authority/1/revoke')
      .send({ reason: 'testing' });
    
    expect(res.status).toBe(200);
    expect(auditService.logAuditEvent).toHaveBeenCalled();
  });
});
