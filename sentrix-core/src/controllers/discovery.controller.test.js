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
vi.mock('../services/security.service.js', () => ({
  signAgentCommand: vi.fn((clientId, command, args = {}) => Promise.resolve({
    data: { command, args },
    hmac: 'signed-hmac',
    timestamp: 1234567890
  }))
}));
vi.mock('../services/client.services.js', () => ({
  getAllClients: vi.fn().mockResolvedValue([])
}));
import { getAllClients } from '../services/client.services.js';

vi.mock('../middlewares/auth.middleware.js', () => ({
  authenticate: (req, res, next) => next(),
  requireRole: () => (req, res, next) => next()
}));

const mockIo = {
  to: vi.fn().mockReturnThis(),
  timeout: vi.fn().mockReturnThis(),
  emit: vi.fn().mockReturnThis(),
  emitWithAck: vi.fn().mockResolvedValue([{ success: true }]),
  sockets: {
    adapter: {
      rooms: {
        get: vi.fn().mockReturnValue(new Set(['dummy-socket-id']))
      }
    }
  }
};

const app = express();
app.use(express.json());
app.set('io', mockIo);
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

  it('POST /api/discovery/deploy (Surgical Update with Handshake)', async () => {
    deployAgentToHost.mockResolvedValue({ success: true, message: 'Updated' });
    getDiscoverySnapshot.mockReturnValue({ devices: [{ ip: '192.168.1.10', registered_client_id: 'agent-123' }] });
    getAllClients.mockResolvedValue([{ ip: '192.168.1.10', id: 'agent-123' }]);

    const res = await request(app)
      .post('/api/discovery/deploy')
      .send({ 
        ip: '192.168.1.10', 
        credentials: { user: 'a', pass: 'p' },
        action: 'update'
      });
    
    expect(res.status).toBe(200);
    expect(mockIo.emitWithAck).toHaveBeenCalledWith('agent:command', {
      data: { command: 'agent:prep-update', args: {} },
      hmac: 'signed-hmac',
      timestamp: 1234567890
    });
    expect(deployAgentToHost).toHaveBeenCalledWith('192.168.1.10', expect.any(Object), undefined, 'update');
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
