import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getDeviceDetails, getHardwareFingerprint, getMetricsFingerprint, getMetrics } from './metrics.service.js';
import si from 'systeminformation';
import * as peripherals from './metrics/peripherals.service.js';

vi.mock('systeminformation');
vi.mock('./metrics/peripherals.service.js');

vi.mock('child_process', () => ({
  execFile: vi.fn((file, args, options, callback) => {
    // Mock execution for ping and netstat
    if (file === 'ping') {
      callback(null, { stdout: 'Reply from 1.1.1.1: bytes=32 time=15ms TTL=57\nPackets: Sent = 4, Received = 4, Lost = 0 (0% loss)\nAverage = 15ms' });
    } else if (file === 'netstat') {
      callback(null, { stdout: 'Bytes 1000 2000' });
    } else {
      callback(new Error('Command not found'));
    }
  })
}));

describe('Agent Profiling Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Default systeminformation mocks
    si.currentLoad.mockResolvedValue({ currentLoad: 10.5 });
    si.mem.mockResolvedValue({ total: 16000000000, used: 8000000000, available: 8000000000 });
    si.fsSize.mockResolvedValue([{ mount: 'C:', size: 1000, used: 800, use: 80, available: 200, fs: 'NTFS' }]);
    si.networkInterfaceDefault.mockResolvedValue('eth0');
    si.networkStats.mockResolvedValue([{ tx_sec: 100, rx_sec: 200, tx_bytes: 1000, rx_bytes: 2000 }]);
    si.osInfo.mockResolvedValue({ distro: 'Windows', release: '10' });
    si.system.mockResolvedValue({ uuid: 'test-uuid-123' });
    si.cpu.mockResolvedValue({ processorid: 'intel-123', manufacturer: 'Intel', brand: 'Core i7' });
    si.diskLayout.mockResolvedValue([{ serial: 'disk-serial-xyz' }]);
    si.graphics.mockResolvedValue({ controllers: [], displays: [] });
    si.bios.mockResolvedValue({});
    si.baseboard.mockResolvedValue({});
    si.memLayout.mockResolvedValue([]);
    si.networkInterfaces.mockResolvedValue([]);

    // Default peripherals mocks
    peripherals.collectUsbDevices.mockResolvedValue([]);
    peripherals.collectSolidUsbDevices.mockResolvedValue([]);
    peripherals.collectSolidDisplays.mockResolvedValue([]);
  });

  it('should generate a consistent hardware fingerprint', async () => {
    si.system.mockResolvedValue({ uuid: 'test-uuid-123' });
    si.cpu.mockResolvedValue({ processorid: 'intel-123' });
    si.diskLayout.mockResolvedValue([{ serial: 'disk-serial-xyz' }]);

    const fingerprint = await getHardwareFingerprint();
    expect(fingerprint).toHaveLength(64); // SHA256 hex length
    
    // Test consistency
    const fingerprint2 = await getHardwareFingerprint();
    expect(fingerprint).toBe(fingerprint2);
  });

  it('should classify peripherals correctly', async () => {
    // Mock systeminformation calls
    si.cpu.mockResolvedValue({ manufacturer: 'Intel', brand: 'Core i7' });
    si.mem.mockResolvedValue({ total: 16000000000 });
    si.memLayout.mockResolvedValue([]);
    si.system.mockResolvedValue({});
    si.bios.mockResolvedValue({});
    si.baseboard.mockResolvedValue({});
    si.graphics.mockResolvedValue({ 
        controllers: [{ model: 'NVIDIA RTX 3080', vendor: 'NVIDIA', vram: 10240 }],
        displays: [{ model: 'Dell U2414H', resolutionX: 1920, resolutionY: 1080 }]
    });
    si.diskLayout.mockResolvedValue([]);
    si.networkInterfaces.mockResolvedValue([]);

    // Mock USB devices
    peripherals.collectUsbDevices.mockResolvedValue([
      { name: 'Logitech USB Optical Mouse', type: 'Mouse', manufacturer: 'Logitech' },
      { name: 'Mechanical Keyboard', type: 'Keyboard', manufacturer: 'Corsair' },
      { name: 'USB Flash Drive', type: 'Storage', manufacturer: 'SanDisk' }
    ]);
    peripherals.collectSolidUsbDevices.mockResolvedValue([]);
    peripherals.collectSolidDisplays.mockResolvedValue([]);

    const details = await getDeviceDetails();

    expect(details.peripherals.mouse).toBe(true);
    expect(details.peripherals.keyboard).toBe(true);
    expect(details.peripherals.storage).toBe(true);
    expect(details.peripherals.webcam).toBe(false); // None mocked

    expect(details.peripherals.graphicsCards[0].model).toBe('NVIDIA RTX 3080');
    expect(details.peripherals.displays[0].resolution).toBe('1920x1080');
  });

  describe('getMetricsFingerprint', () => {
    it('should generate a SHA256 fingerprint that is identical for matching metrics content', () => {
      const payload1 = {
        deviceId: 'agent-1',
        hostname: 'PC-1',
        timestamp: 1000,
        lastUpdatedAt: 900,
        system: {
          cpu: { usage: 10 },
          memory: { usage: 40 },
          uptimeSeconds: 120
        }
      };

      const payload2 = {
        deviceId: 'agent-1',
        hostname: 'PC-1',
        timestamp: 2000,
        lastUpdatedAt: 1900,
        system: {
          cpu: { usage: 10 },
          memory: { usage: 40 },
          uptimeSeconds: 240
        }
      };

      const fingerprint1 = getMetricsFingerprint(payload1);
      const fingerprint2 = getMetricsFingerprint(payload2);

      expect(fingerprint1).toBe(fingerprint2);
      expect(fingerprint1).toHaveLength(64);
    });

    it('should generate a different fingerprint if metrics content changes', () => {
      const payload1 = {
        deviceId: 'agent-1',
        system: { cpu: { usage: 10 } }
      };

      const payload2 = {
        deviceId: 'agent-1',
        system: { cpu: { usage: 20 } }
      };

      const fingerprint1 = getMetricsFingerprint(payload1);
      const fingerprint2 = getMetricsFingerprint(payload2);

      expect(fingerprint1).not.toBe(fingerprint2);
    });
  });

  describe('Cache Stability Guard', () => {
    it('should overwrite with fallback metrics if no good metrics are cached', async () => {
      si.currentLoad.mockRejectedValue(new Error('SI CPU Error'));
      si.mem.mockRejectedValue(new Error('SI MEM Error'));

      const result = await getMetrics();
      expect(result.system.cpu.usage).toBeNull();
      expect(result.system.memory.usage).toBeNull();
    });

    it('should retain last known good metrics on transient collector failure', async () => {
      const originalDateNow = Date.now;
      let timeOffset = 0;
      const dateSpy = vi.spyOn(Date, 'now').mockImplementation(() => originalDateNow() + timeOffset);

      // 1. First collection returns valid metrics (cpu = 10.5 rounded to 11, memory = 50%)
      si.currentLoad.mockResolvedValue({ currentLoad: 10.5 });
      si.mem.mockResolvedValue({ total: 16000000000, used: 8000000000, available: 8000000000 });

      // Force collection by advancing time offset
      timeOffset += 10000;

      const firstResult = await getMetrics();
      expect(firstResult.system.cpu.usage).toBe(11);
      expect(firstResult.system.memory.usage).toBe(50);

      // 2. Second collection returns fallback/errors
      si.currentLoad.mockRejectedValue(new Error('SI CPU Error'));
      si.mem.mockRejectedValue(new Error('SI MEM Error'));

      // Advance time beyond the refresh interval
      timeOffset += 10000;

      const secondResult = await getMetrics();
      // It should RETAIN the last known good metrics (11% cpu, 50% memory)
      expect(secondResult.system.cpu.usage).toBe(11);
      expect(secondResult.system.memory.usage).toBe(50);

      dateSpy.mockRestore();
    });
  });
});
