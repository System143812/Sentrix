import { describe, it, expect, vi } from 'vitest';
import si from 'systeminformation';
import { collectCpuMetrics } from './cpu.service.js';
import { collectMemoryMetrics } from './memory.service.js';

vi.mock('systeminformation');

describe('Agent Metrics Services', () => {
  describe('CPU Service', () => {
    it('should collect CPU metrics correctly', async () => {
      si.currentLoad.mockResolvedValue({
        currentLoad: 25.5
      });

      const metrics = await collectCpuMetrics();
      expect(metrics).toEqual({
        usage: 26
      });
      expect(si.currentLoad).toHaveBeenCalled();
    });

    it('should return null values on failure', async () => {
      si.currentLoad.mockRejectedValue(new Error('SI Error'));

      const metrics = await collectCpuMetrics();
      expect(metrics).toEqual({
        usage: null
      });
    });
  });

  describe('Memory Service', () => {
    it('should collect Memory metrics correctly', async () => {
      si.mem.mockResolvedValue({
        total: 16000000000,
        used: 8000000000,
        available: 8000000000
      });

      const metrics = await collectMemoryMetrics();
      expect(metrics).toEqual({
        usage: 50,
        totalBytes: 16000000000,
        usedBytes: 8000000000,
        availableBytes: 8000000000
      });
      expect(si.mem).toHaveBeenCalled();
    });

    it('should return null values on failure', async () => {
      si.mem.mockRejectedValue(new Error('SI Error'));

      const metrics = await collectMemoryMetrics();
      expect(metrics).toEqual({
        usage: null,
        totalBytes: null,
        usedBytes: null,
        availableBytes: null
      });
    });
  });
});
