import { describe, it, expect, vi } from 'vitest';
import si from 'systeminformation';
import { collectDiskMetrics } from './disk.service.js';
import { collectNetworkMetrics } from './network.service.js';

vi.mock('systeminformation');
vi.mock('child_process', () => ({
  execFile: (file, args, options, callback) => {
    // Return mock ping output
    if (file === 'ping') {
      callback(null, { stdout: 'Reply from 1.1.1.1: bytes=32 time=15ms TTL=57\nPackets: Sent = 4, Received = 4, Lost = 0 (0% loss)\nAverage = 15ms' });
    } else if (file === 'netstat') {
      callback(null, { stdout: 'Bytes 1000 2000' });
    }
  }
}));

describe('Expanded Agent Metrics', () => {
  describe('Disk Service', () => {
    it('should select primary disk and return metrics', async () => {
      si.fsSize.mockResolvedValue([
        { mount: 'D:', size: 2000, used: 1000, use: 50, available: 1000, fs: 'NTFS' },
        { mount: 'C:', size: 1000, used: 800, use: 80, available: 200, fs: 'NTFS' }
      ]);

      const metrics = await collectDiskMetrics();
      // On Windows (where this test is likely running or simulated), it should pick C:
      expect(metrics.mount).toBe('C:');
      expect(metrics.usage).toBe(80);
      expect(metrics.totalBytes).toBe(1000);
    });
  });

  describe('Network Service', () => {
    it('should collect network metrics with latency and loss', async () => {
      si.networkInterfaceDefault.mockResolvedValue('eth0');
      si.networkStats.mockResolvedValue([{
        tx_sec: 100,
        rx_sec: 200,
        tx_bytes: 1000,
        rx_bytes: 2000
      }]);

      const metrics = await collectNetworkMetrics();
      expect(metrics.interface).toBe('eth0');
      expect(metrics.latencyMs).toBe(15);
      expect(metrics.packetLoss).toBe(0);
    });
  });
});
