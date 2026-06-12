import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execFile } from 'child_process';

// We need to mock child_process BEFORE importing the service
vi.mock('child_process', () => ({
  execFile: vi.fn()
}));

// Mock systeminformation as well to avoid overhead
vi.mock('systeminformation');

describe('Peripherals Service (Sanity Check)', async () => {
  // Import the service after mocking
  const { collectUsbDevices, resetPnpCache } = await import('./peripherals.service.js');

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('should suppress a transient 0-device scan if cache is populated', async () => {
    const mockFullResult = JSON.stringify([
      { FriendlyName: 'Mouse', InstanceId: 'USB\\VID_1&PID_1', Class: 'Mouse' },
      { FriendlyName: 'Keyboard', InstanceId: 'USB\\VID_2&PID_2', Class: 'Keyboard' },
      { FriendlyName: 'Camera', InstanceId: 'USB\\VID_3&PID_3', Class: 'Image' }
    ]);

    // 1st call: Success
    execFile.mockImplementationOnce((cmd, args, opts, cb) => cb(null, { stdout: mockFullResult }));
    const firstResults = await collectUsbDevices();
    expect(firstResults.length).toBe(3);

    // 2nd call: Simulation of a Windows PnP "stutter" (returns empty array)
    execFile.mockImplementationOnce((cmd, args, opts, cb) => cb(null, { stdout: '[]' }));
    const secondResults = await collectUsbDevices();

    // Verification: It should return the CACHED results (length 3) instead of []
    expect(secondResults.length).toBe(3);
    expect(secondResults[0].name).toBe('Mouse');
  });

  it('should suppress a mass drop (>70%) if cache is populated', async () => {
    const mockMassiveResult = JSON.stringify([
      { FriendlyName: 'D1', InstanceId: 'USB\\1', Class: 'USB' },
      { FriendlyName: 'D2', InstanceId: 'USB\\2', Class: 'USB' },
      { FriendlyName: 'D3', InstanceId: 'USB\\3', Class: 'USB' },
      { FriendlyName: 'D4', InstanceId: 'USB\\4', Class: 'USB' },
      { FriendlyName: 'D5', InstanceId: 'USB\\5', Class: 'USB' },
      { FriendlyName: 'D6', InstanceId: 'USB\\6', Class: 'USB' }
    ]);

    // 1st call: Populates cache with 6 devices
    execFile.mockImplementationOnce((cmd, args, opts, cb) => cb(null, { stdout: mockMassiveResult }));
    await collectUsbDevices();

    // 2nd call: Suddenly only 1 device (83% drop)
    const mockDropResult = JSON.stringify([
      { FriendlyName: 'D1', InstanceId: 'USB\\1', Class: 'USB' }
    ]);
    execFile.mockImplementationOnce((cmd, args, opts, cb) => cb(null, { stdout: mockDropResult }));
    
    const resultsAfterDrop = await collectUsbDevices();

    // Verification: Threshold (70%) exceeded, should return cache (6 devices)
    expect(resultsAfterDrop.length).toBe(6);
  });

  it('should allow a normal minor disconnect (e.g. 1 out of 3 devices)', async () => {
    const mockResult = JSON.stringify([
      { FriendlyName: 'Mouse', InstanceId: 'USB\\1', Class: 'USB' },
      { FriendlyName: 'Keyboard', InstanceId: 'USB\\2', Class: 'USB' },
      { FriendlyName: 'Webcam', InstanceId: 'USB\\3', Class: 'USB' }
    ]);

    execFile.mockImplementationOnce((cmd, args, opts, cb) => cb(null, { stdout: mockResult }));
    await collectUsbDevices();

    // Unplug the webcam (2 left, 33% drop)
    const mockAfterUnplug = JSON.stringify([
      { FriendlyName: 'Mouse', InstanceId: 'USB\\1', Class: 'USB' },
      { FriendlyName: 'Keyboard', InstanceId: 'USB\\2', Class: 'USB' }
    ]);
    execFile.mockImplementationOnce((cmd, args, opts, cb) => cb(null, { stdout: mockAfterUnplug }));

    const resultsAfterUnplug = await collectUsbDevices();

    // Verification: Normal disconnect should be passed through
    expect(resultsAfterUnplug.length).toBe(2);
  });

  it('should filter out system radio controls and generic infrastructure noise', async () => {
    const mockNoiseResult = JSON.stringify([
      { 
        FriendlyName: 'HID-compliant wireless radio controls', 
        InstanceId: 'HID\\HPQ6001\\3', 
        Class: 'HIDClass',
        Service: null,
        Manufacturer: '(Standard system devices)'
      },
      { 
        FriendlyName: 'System board', 
        InstanceId: 'ACPI\\PNP0C01\\2', 
        Class: 'System',
        Service: null,
        Manufacturer: '(Standard system devices)'
      },
      { 
        FriendlyName: 'USB Root Hub (USB 3.0)', 
        InstanceId: 'IUSB3\\ROOT_HUB30\\4', 
        Class: 'USB',
        Service: 'usbhub3',
        Manufacturer: '(Standard USB HUBs)'
      },
      { 
        FriendlyName: 'Real Peripheral Mouse', 
        InstanceId: 'USB\\VID_1111&PID_2222\\5', 
        Class: 'Mouse',
        Service: 'mouhid',
        Manufacturer: 'Logitech'
      }
    ]);

    execFile.mockImplementationOnce((cmd, args, opts, cb) => cb(null, { stdout: mockNoiseResult }));
    
    const results = await collectUsbDevices();

    // Verification: Only 'Real Peripheral Mouse' should remain.
    // Radio controls, System board (generic manufacturer + not priority), and Hub (service) should be gone.
    expect(results.length).toBe(1);
    expect(results[0].name).toBe('Real Peripheral Mouse');
  });

  it('should cache PnP query results in production/non-test environment', async () => {
    resetPnpCache();
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const mockResult = JSON.stringify([
        { FriendlyName: 'Mouse', InstanceId: 'USB\\1', Class: 'USB' }
      ]);

      let callCount = 0;
      execFile.mockImplementation((cmd, args, opts, cb) => {
        callCount++;
        cb(null, { stdout: mockResult });
      });

      // Trigger two collections in parallel
      await Promise.all([
        collectUsbDevices(),
        collectUsbDevices()
      ]);

      // Verification: Should only have executed execFile once due to caching
      expect(callCount).toBe(1);
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });
});
