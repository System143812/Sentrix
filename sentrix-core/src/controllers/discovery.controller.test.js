import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import discoveryRouter from '../routes/discovery.route.js';
import * as discoveryService from '../services/discovery/index.js';
import { errorHandler } from '../middlewares/error.middleware.js';

vi.mock('../services/discovery/index.js', () => ({
  getDiscoverySnapshot: vi.fn(),
  runDiscoveryScan: vi.fn(),
  deployAgentToHost: vi.fn(),
  getInterfaces: vi.fn()
}));
import { getDiscoverySnapshot, runDiscoveryScan, deployAgentToHost, getInterfaces } from '../services/discovery/index.js';

vi.mock('../services/audit.service.js');
vi.mock('../middlewares/auth.middleware.js', () => ({
  authenticate: (req, res, next) => next(),
  requireRole: () => (req, res, next) => next()
}));

const app = express();
app.use(express.json());
app.use('/api/discovery', discoveryRouter);
app.use(errorHandler);

describe('Discovery Controller (Full Coverage)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('POST /api/discovery/scan', async () => {
    runDiscoveryScan.mockResolvedValue();
    getDiscoverySnapshot.mockReturnValue({ scanning: false, results: [] });
    const res = await request(app).post('/api/discovery/scan').send({ subnet: '192.168.1' });
    expect(res.status).toBe(200);
  });

  it('GET /api/discovery/interfaces', async () => {
    const res = await request(app).get('/api/discovery/interfaces');
    expect(res.status).toBe(200);
  });

  it('GET /api/discovery/', async () => {
    getDiscoverySnapshot.mockReturnValue({ scanning: false, results: [] });
    const res = await request(app).get('/api/discovery/');
    expect(res.status).toBe(200);
  });

  it('POST /api/discovery/deploy', async () => {
    deployAgentToHost.mockResolvedValue({ success: true, message: 'Deployed' });
    const res = await request(app)
      .post('/api/discovery/deploy')
      .send({ ip: '127.0.0.1', credentials: { user: 'a', pass: 'p' } });
    
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('POST /api/discovery/deploy (missing ip)', async () => {
    const res = await request(app)
      .post('/api/discovery/deploy')
      .send({ credentials: { user: 'a', pass: 'p' } });
    
    expect(res.status).toBe(400);
  });

  it('POST /api/discovery/deploy (failed deployment)', async () => {
    deployAgentToHost.mockResolvedValue({ success: false, message: 'Access denied' });
    const res = await request(app)
      .post('/api/discovery/deploy')
      .send({ ip: '127.0.0.1' });
    
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(false);
  });
});
