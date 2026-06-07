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
    timeout: () => ({ emitWithAck: vi.fn().mockResolvedValue({ success: true, message: 'Command accepted' }) })
  }])
};
app.set('io', mockIo);
app.use('/api/clients', clientRouter);
app.use(errorHandler);

describe('Client Controller (Full Coverage)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET /api/clients/', async () => {
    clientService.getClientSummary.mockResolvedValue([{ id: '1', hostname: 'PC-1' }]);
    const res = await request(app).get('/api/clients/');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

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
    expect(res.body.data.cpu).toBe('Intel');
  });

  it('GET /api/clients/:id/processes', async () => {
    clientService.getClientProcesses.mockResolvedValue([{ pid: 1, name: 'system' }]);
    const res = await request(app).get('/api/clients/1/processes');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('GET /api/clients/:id/network-activity', async () => {
    clientService.getClientNetworkActivity.mockResolvedValue([{ local: '127.0.0.1' }]);
    const res = await request(app).get('/api/clients/1/network-activity');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('GET /api/clients/:id/activity-history', async () => {
    clientService.getClientActivityHistory.mockResolvedValue([{ timestamp: '2023-01-01' }]);
    const res = await request(app).get('/api/clients/1/activity-history');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('GET /api/clients/:id/peripherals/history', async () => {
    clientService.getClientPeripheralHistory.mockResolvedValue([{ event: 'connected' }]);
    const res = await request(app).get('/api/clients/1/peripherals/history');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('PATCH /api/clients/:id/peripherals/:key/resolve', async () => {
    clientService.resolveClientPeripheral.mockResolvedValue({ name: 'Mouse' });
    clientService.getClientById.mockResolvedValue({ hostname: 'PC-1' });
    const res = await request(app).patch('/api/clients/1/peripherals/mouse-key/resolve').send({ note: 'fixed' });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Mouse');
  });

  it('PATCH /api/clients/:id/peripherals/:key/archive', async () => {
    clientService.archiveClientPeripheral.mockResolvedValue({ name: 'Mouse' });
    const res = await request(app).patch('/api/clients/1/peripherals/mouse-key/archive');
    expect(res.status).toBe(200);
  });

  it('PATCH /api/clients/:id/peripherals/:key/recover', async () => {
    clientService.recoverClientPeripheral.mockResolvedValue({ name: 'Mouse' });
    const res = await request(app).patch('/api/clients/1/peripherals/mouse-key/recover');
    expect(res.status).toBe(200);
  });

  it('GET /api/clients/:id/events', async () => {
    clientService.getClientEvents.mockResolvedValue([{ id: 1 }]);
    const res = await request(app).get('/api/clients/1/events');
    expect(res.status).toBe(200);
  });

  it('GET /api/clients/:id/domains', async () => {
    clientService.getClientDomains.mockResolvedValue([{ domain: 'google.com' }]);
    const res = await request(app).get('/api/clients/1/domains');
    expect(res.status).toBe(200);
  });

  it('GET /api/clients/:id/software', async () => {
    clientService.getClientSoftware.mockResolvedValue([{ name: 'Chrome' }]);
    const res = await request(app).get('/api/clients/1/software');
    expect(res.status).toBe(200);
  });

  it('GET /api/clients/:id/health', async () => {
    clientService.getClientHealth.mockResolvedValue({ score: 100 });
    const res = await request(app).get('/api/clients/1/health');
    expect(res.status).toBe(200);
  });

  it('GET /api/clients/:id/anomalies', async () => {
    clientService.getClientAnomalies.mockResolvedValue([{ type: 'high_cpu' }]);
    const res = await request(app).get('/api/clients/1/anomalies');
    expect(res.status).toBe(200);
  });

  it('PATCH /api/clients/:id/group', async () => {
    clientService.updateClientGroup.mockResolvedValue({ id: '1', group: 'Lab A', hostname: 'PC-1' });
    clientService.getClientSummary.mockResolvedValue([]);
    const res = await request(app).patch('/api/clients/1/group').send({ group: 'Lab A' });
    expect(res.status).toBe(200);
    expect(res.body.data.group).toBe('Lab A');
  });

  it('DELETE /api/clients/:id', async () => {
    clientService.getClientById.mockResolvedValue({ id: '1', hostname: 'PC-1' });
    clientService.archiveClient.mockResolvedValue(true);
    clientService.getClientSummary.mockResolvedValue([]);
    const res = await request(app).delete('/api/clients/1');
    expect(res.status).toBe(200);
  });

  it('POST /api/clients/:id/command', async () => {
    clientService.getClientById.mockResolvedValue({ id: '1', hostname: 'PC-1' });
    const res = await request(app).post('/api/clients/1/command').send({ command: 'restart' });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Command accepted');
  });

  it('POST /api/clients/:id/command (utility)', async () => {
    clientService.getClientById.mockResolvedValue({ id: '1', hostname: 'PC-1' });
    const res = await request(app).post('/api/clients/1/command').send({ command: 'utility:check-disk' });
    expect(res.status).toBe(200);
  });

  it('POST /api/clients/:id/command (unsupported)', async () => {
    const res = await request(app).post('/api/clients/1/command').send({ command: 'format-c' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Unsupported remote command.');
  });

  it('POST /api/clients/:id/processes/:pid/kill', async () => {
    clientService.getClientById.mockResolvedValue({ id: '1', hostname: 'PC-1' });
    const res = await request(app).post('/api/clients/1/processes/123/kill');
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Process terminated successfully.');
  });
});
