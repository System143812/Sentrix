import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../src/modules/security/security.service.js', () => ({
  isRequestRateLimited: vi.fn().mockResolvedValue(false),
  isRequestAuthorized: vi.fn().mockResolvedValue(true),
  initSecurityService: vi.fn(),
  signAgentCommand: vi.fn(),
}));

import createApp from '../../src/app.js';
import pool from '../../src/lib/database.js';

describe('Runtime Startup and Health Integration Check', () => {
  let app;
  let server;

  beforeAll(async () => {
    app = createApp();
    server = app.listen(0);
  });

  afterAll(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    if (pool) {
      await pool.end();
    }
  });

  it('boots up and responds to health checks without runtime errors', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Ready to go!');
  });

  it('responds to API discovery endpoints during runtime', async () => {
    const res = await request(app).get('/api/discovery');
    expect([200, 401, 403]).toContain(res.status);
  });
});
