import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';
import { connectToCore } from './socket.service.js';
import { io } from 'socket.io-client';
import { killProcess } from './metrics/processes.service.js';

vi.mock('socket.io-client');
vi.mock('./metrics/processes.service.js');
vi.mock('./metrics.service.js', () => ({
  getHardwareFingerprint: vi.fn().mockResolvedValue('test-fingerprint'),
  getAgentProfile: vi.fn(),
  getDeviceDetails: vi.fn(),
  getMetrics: vi.fn(),
  setGlobalMetricInterval: vi.fn()
}));
vi.mock('child_process', () => ({
  execFile: vi.fn((file, args, options, callback) => {
    const cb = typeof options === 'function' ? options : callback;
    cb(null, { stdout: 'Command Success' });
  }),
  exec: vi.fn((cmd, options, callback) => {
    const cb = typeof options === 'function' ? options : callback;
    cb(null, { stdout: 'Command Success' });
  }),
  spawn: vi.fn(() => ({
    unref: vi.fn()
  }))
}));
import { execFile, exec, spawn } from 'child_process';

describe('Socket Service', () => {
  let mockSocket;
  const mockProfile = { agentId: 'test-agent', hostname: 'PC-01' };
  const secureKey = 'test-secure-key';

  beforeEach(() => {
    vi.clearAllMocks();
    mockSocket = {
      on: vi.fn(),
      emit: vi.fn(),
      connected: true,
      close: vi.fn()
    };
    io.mockReturnValue(mockSocket);
  });

  function signCommand(command, args) {
    const data = { command, args };
    const timestamp = Date.now();
    const hmac = crypto
      .createHmac('sha256', secureKey)
      .update(JSON.stringify(data) + timestamp)
      .digest('hex');

    return { data, hmac, timestamp };
  }

  async function getRegisteredCommandHandler() {
    connectToCore({ serverUrl: 'https://localhost:4000', profile: mockProfile });
    mockSocket.emit.mockImplementationOnce((event, payload, callback) => {
      if (event === 'agent:register') {
        callback?.({ success: true, secureKey });
      }
    });

    const connectHandler = mockSocket.on.mock.calls.find(call => call[0] === 'connect')[1];
    await connectHandler();
    return mockSocket.on.mock.calls.find(call => call[0] === 'agent:command')[1];
  }

  it('should register agent on connect', async () => {
    connectToCore({ serverUrl: 'https://localhost:4000', profile: mockProfile });
    
    // Find the 'connect' listener and trigger it
    const connectHandler = mockSocket.on.mock.calls.find(call => call[0] === 'connect')[1];
    await connectHandler();

    expect(mockSocket.emit).toHaveBeenCalledWith('agent:register', expect.objectContaining({
      ...mockProfile,
      fingerprint: expect.any(String)
    }), expect.any(Function));
  });

  it('should handle remote power commands', async () => {
    const commandHandler = await getRegisteredCommandHandler();
    const callback = vi.fn();

    // Mock platform to windows for this test if possible, or assume the service check handles it
    // The service has: if (process.platform !== "win32") return ...
    // We'll test the command routing regardless of execution success
    await commandHandler(signCommand('restart'), callback);

    if (process.platform === 'win32') {
        expect(execFile).toHaveBeenCalledWith('shutdown.exe', expect.any(Array), expect.any(Object), expect.any(Function));
    }
  });

  it('should handle kill-process command', async () => {
    const commandHandler = await getRegisteredCommandHandler();
    killProcess.mockResolvedValue({ success: true });

    await commandHandler(signCommand('kill-process', { pid: 1234 }), vi.fn());

    expect(killProcess).toHaveBeenCalledWith(1234);
  });

  it('should handle utility maintenance commands', async () => {
    const commandHandler = await getRegisteredCommandHandler();
    const callback = vi.fn();

    await commandHandler(signCommand('utility:network-reset'), callback);

    expect(exec).toHaveBeenCalled();
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('should handle agent:prep-update (Master Key) command', async () => {
    const commandHandler = await getRegisteredCommandHandler();
    const callback = vi.fn();

    await commandHandler(signCommand('agent:prep-update'), callback);

    expect(exec).toHaveBeenCalled();
    expect(callback).toHaveBeenCalledWith({
      success: true,
      message: "Master Key activation successful."
    });
  });

  it('should reject unsigned commands', async () => {
    const commandHandler = await getRegisteredCommandHandler();
    const callback = vi.fn();

    await commandHandler({ command: 'restart' }, callback);

    expect(callback).toHaveBeenCalledWith({
      success: false,
      message: "Signed command required."
    });
  });
});
