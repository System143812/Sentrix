import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import userRouter from '../routes/user.route.js';
import * as userService from '../services/user.services.js';
import { errorHandler } from '../middlewares/error.middleware.js';

vi.mock('../services/user.services.js');
vi.mock('../services/audit.service.js');
vi.mock('../middlewares/auth.middleware.js', () => ({
  authenticate: (req, res, next) => next(),
  requireRole: () => (req, res, next) => next()
}));

const app = express();
app.use(express.json());
app.use('/api/users', userRouter);
app.use(errorHandler);

describe('User Controller', () => {
  it('GET /api/users', async () => {
    userService.getAllAdmins.mockResolvedValue([{ email: 'u@u.com' }]);
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(200);
  });

  it('POST /api/users', async () => {
    userService.createUser.mockResolvedValue({ id: 1, email: 'new@u.com' });
    const res = await request(app).post('/api/users').send({ email: 'new@u.com', password: 'p' });
    expect(res.status).toBe(201);
  });

  it('DELETE /api/users/:id', async () => {
    userService.getUserById.mockResolvedValue({ id: '1', role: 'admin' });
    userService.deleteUser.mockResolvedValue(true);
    const res = await request(app).delete('/api/users/1');
    expect(res.status).toBe(200);
  });
});
