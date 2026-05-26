import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import clientRouter from '../routes/client.route.js';
import * as clientService from '../services/client.services.js';
import { errorHandler } from '../middlewares/error.middleware.js';

vi.mock('../services/client.services.js');
vi.mock('../services/audit.service.js');
vi.mock('../middlewares/auth.middleware.js', () => ({
  authenticate: (req, res, next) => {
    req.user = { id: 1, role: 'admin' };
    next();
  },
  requireRole: () => (req, res, next) => next()
}));

const app = express();
app.use(express.json());
app.use((req, res, next) => { req.headers['x-requested-with'] = 'XMLHttpRequest'; next(); });

const mockIo = {
  in: vi.fn().mockReturnThis(),
  to: vi.fn().mockReturnThis(),
  emit: vi.fn(),
  fetchSockets: vi.fn().mockResolvedValue([{
    timeout: () => ({ emitWithAck: vi.fn().mockResolvedValue({ success: true }) })
  }])
};
app.set('io', mockIo);
app.use('/api/clients', clientRouter);
app.use(errorHandler);

describe('Client Controller (Complete)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GET /api/clients/:id', async () => {
    clientService.getClientById.mockResolvedValue({ id: '1', hostname: 'PC-1' });
    const res = await request(app).get('/api/clients/1');
    expect(res.status).toBe(200);
    expect(res.body.data.hostname).toBe('PC-1');
  });

  it('GET /api/clients/:id/metrics', async () => {
    clientService.getClientMetrics.mockResolvedValue([{ cpu: 10 }]);
    const res = await request(app).get('/api/clients/1/metrics');
    expect(res.status).toBe(200);
    expect(res.body.data[0].cpu).toBe(10);
  });

  it('GET /api/clients/:id/hardware', async () => {
    clientService.getClientHardwareDetails.mockResolvedValue({ cpu: 'Intel' });
    const res = await request(app).get('/api/clients/1/hardware');
    expect(res.status).toBe(200);
  });

  it('PATCH /api/clients/:id/group', async () => {
    clientService.updateClientGroup.mockResolvedValue({ id: '1', group: 'Lab A' });
    const res = await request(app).patch('/api/clients/1/group').send({ group: 'Lab A' });
    expect(res.status).toBe(200);
    expect(res.body.data.group).toBe('Lab A');
  });

  it('DELETE /api/clients/:id', async () => {
    clientService.getClientById.mockResolvedValue({ id: '1' });
    clientService.archiveClient.mockResolvedValue(true);
    const res = await request(app).delete('/api/clients/1');
    expect(res.status).toBe(200);
  });

  it('POST /api/clients/:id/processes/:pid/kill', async () => {
    clientService.getClientById.mockResolvedValue({ id: '1' });
    const res = await request(app).post('/api/clients/1/processes/123/kill');
    expect(res.status).toBe(200);
  });
});
