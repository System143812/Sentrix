import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import authRouter from '../routes/auth.route.js';
import * as userServices from '../services/user.services.js';
import * as auditService from '../services/audit.service.js';
import { errorHandler } from '../middlewares/error.middleware.js';

vi.mock('../services/user.services.js');
vi.mock('../services/audit.service.js');
vi.mock('../services/security.service.js', () => ({
  isUserBlocked: vi.fn().mockResolvedValue(false),
}));
vi.mock('../middlewares/auth.middleware.js', () => ({
  authenticate: (req, res, next) => {
    req.user = { id: 1, email: 'test@example.com', role: 'admin' };
    next();
  }
}));

const app = express();
app.use(express.json());
app.use('/api/auth', authRouter);
app.use(errorHandler);

describe('Auth Controller (Complete)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('POST /api/auth/login - success', async () => {
    userServices.getUserForAuth.mockResolvedValue({ id: 1, email: 't@t.com', role: 'admin', active: true });
    userServices.validatePassword.mockResolvedValue(true);
    const res = await request(app).post('/api/auth/login').send({ email: 't@t.com', password: 'p' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('POST /api/auth/register - success (first user)', async () => {
    userServices.countUsers.mockResolvedValue(0);
    userServices.seedInitialAdmin.mockResolvedValue({ id: 1, email: 'admin@sentrix.local' });
    const res = await request(app).post('/api/auth/register').send({ email: 'a@a.com', password: 'p' });
    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe('admin@sentrix.local');
  });

  it('POST /api/auth/register - forbidden (not first user)', async () => {
    userServices.countUsers.mockResolvedValue(5);
    const res = await request(app).post('/api/auth/register').send({ email: 'a@a.com', password: 'p' });
    expect(res.status).toBe(403);
  });

  it('POST /api/auth/logout', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('GET /api/auth/me', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe('test@example.com');
  });

  it('PATCH /api/auth/password', async () => {
    userServices.updateUserPassword.mockResolvedValue({ id: 1, email: 't@t.com' });
    const res = await request(app).patch('/api/auth/password').send({ currentPassword: 'old', nextPassword: 'new' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
