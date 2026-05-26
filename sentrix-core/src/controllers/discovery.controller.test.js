import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import discoveryRouter from '../routes/discovery.route.js';
import * as discoveryService from '../services/discovery/index.js';
import { errorHandler } from '../middlewares/error.middleware.js';

vi.mock('../services/discovery/index.js', () => ({
  getDiscoverySnapshot: vi.fn(),
  runDiscoveryScan: vi.fn()
}));
import { getDiscoverySnapshot, runDiscoveryScan } from '../services/discovery/index.js';

vi.mock('../middlewares/auth.middleware.js', () => ({
  authenticate: (req, res, next) => next(),
  requireRole: () => (req, res, next) => next()
}));

const app = express();
app.use(express.json());
app.use('/api/discovery', discoveryRouter);
app.use(errorHandler);

describe('Discovery Controller', () => {
  it('GET /api/discovery/scan', async () => {
    runDiscoveryScan.mockResolvedValue();
    getDiscoverySnapshot.mockReturnValue({ scanning: false, results: [] });
    const res = await request(app).get('/api/discovery/scan');
    expect(res.status).toBe(200);
  });

  it('GET /api/discovery/', async () => {
    getDiscoverySnapshot.mockReturnValue({ scanning: false, results: [] });
    const res = await request(app).get('/api/discovery/');
    expect(res.status).toBe(200);
  });
});
