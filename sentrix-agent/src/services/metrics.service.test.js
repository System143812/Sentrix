import { describe, it, expect, vi } from 'vitest';
import { getDeviceDetails } from './metrics.service.js';
import si from 'systeminformation';
import * as peripherals from './metrics/peripherals.service.js';

vi.mock('systeminformation');
vi.mock('./metrics/peripherals.service.js');

describe('Agent Profiling Service', () => {
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
});
