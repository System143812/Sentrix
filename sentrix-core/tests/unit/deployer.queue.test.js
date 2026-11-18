import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deployAgentViaSMB } from '../../src/modules/discovery/deployer.js';

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    spawn: vi.fn(() => {
      const cp = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event, cb) => {
          if (event === 'close') {
            setTimeout(() => cb(0), 50);
          }
        })
      };
      return cp;
    })
  };
});

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(true),
    statSync: vi.fn().mockReturnValue({ isFile: () => true, isDirectory: () => true, size: 100 }),
    readFileSync: vi.fn().mockReturnValue(Buffer.from('mock')),
    readdirSync: vi.fn().mockReturnValue([]),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    cpSync: vi.fn(),
    rmSync: vi.fn(),
    unlinkSync: vi.fn(),
  };
});

vi.mock('../../src/modules/clients/clients.repository.js', () => ({
  ClientRepository: {
    findAllIncludingArchived: vi.fn().mockResolvedValue([])
  }
}));

vi.mock('../../src/modules/discovery/discovery.repository.js', () => ({
  DiscoveryRepository: {
    clearProcessingByIpOrMac: vi.fn().mockResolvedValue(),
    findScanResults: vi.fn().mockResolvedValue([]),
    upsertScanResults: vi.fn().mockResolvedValue()
  }
}));

vi.mock('../../src/modules/security/security.service.js', () => ({
  generateProvisioningToken: vi.fn().mockResolvedValue('mock-token')
}));

describe('Deployer Concurrency Queue', () => {
  it('should queue and execute multiple deployment requests successfully', async () => {
    const p1 = deployAgentViaSMB('192.168.1.1', new Map(), { user: 'a', pass: 'b' });
    const p2 = deployAgentViaSMB('192.168.1.2', new Map(), { user: 'a', pass: 'b' });
    const p3 = deployAgentViaSMB('192.168.1.3', new Map(), { user: 'a', pass: 'b' });

    const results = await Promise.all([p1, p2, p3]);
    expect(results.length).toBe(3);
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(true);
    expect(results[2].success).toBe(true);
  }, 20000);
});
