import { describe, it, expect, vi, beforeEach } from 'vitest';
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

describe('Audit Controller (Full Coverage)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET /api/audit', async () => {
    auditService.getAuditLogs.mockResolvedValue([{ action: 'login' }]);
    const res = await request(app).get('/api/audit');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('POST /api/audit/:id/authorize', async () => {
    auditService.authorizeLogSubject.mockResolvedValue({ id: 1, identifier: 'test' });
    const res = await request(app).post('/api/audit/1/authorize').send({ reason: 'Trusted' });
    expect(res.status).toBe(200);
    expect(res.body.data.identifier).toBe('test');
  });

  it('POST /api/audit/:id/block', async () => {
    auditService.blockLogSubject.mockResolvedValue({ id: 1, identifier: 'test' });
    const res = await request(app).post('/api/audit/1/block').send({ reason: 'Suspicious' });
    expect(res.status).toBe(200);
    expect(res.body.data.identifier).toBe('test');
  });

  it('GET /api/audit/authority', async () => {
    auditService.getBlockedSubjects.mockResolvedValue([{ identifier: '00:11:22:33:44:55' }]);
    const res = await request(app).get('/api/audit/authority');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('POST /api/audit/authority/:id/revoke', async () => {
    auditService.revokeAuthorityRecord.mockResolvedValue({ id: 1, subject_type: 'mac', identifier: 'test', category: 'whitelist', label: 'Test' });
    const res = await request(app)
      .post('/api/audit/authority/1/revoke')
      .send({ reason: 'testing' });
    
    expect(res.status).toBe(200);
    expect(auditService.logAuditEvent).toHaveBeenCalled();
  });

  it('POST /api/audit/whitelist', async () => {
    const res = await request(app)
      .post('/api/audit/whitelist')
      .send({ label: 'Test Device', type: 'mac', identifier: '00:11:22:33:44:55' });
    
    expect(res.status).toBe(200);
    expect(auditService.authorizeAuditDevice).toHaveBeenCalled();
  });

  it('POST /api/audit/whitelist (missing fields)', async () => {
    const res = await request(app)
      .post('/api/audit/whitelist')
      .send({ label: 'Test Device' });
    
    expect(res.status).toBe(400);
  });
});
