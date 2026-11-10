import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import { connectToCore } from './socket.service.js';
import { io } from 'socket.io-client';
import { killProcess } from './metrics/processes.service.js';
import { runRemotePowerCommand } from '../utils/power.js';
import { getHardwareFingerprint } from './metrics.service.js';

vi.mock('socket.io-client');
vi.mock('./metrics/processes.service.js');
vi.mock('../utils/power.js', () => ({
  runRemotePowerCommand: vi.fn().mockResolvedValue({ success: true, message: 'Power command simulated' })
}));
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
import { execFile, exec } from 'child_process';

describe('Socket Service Security & Lifecycle', () => {
  let mockSocket;
  const mockProfile = { agentId: 'test-agent', hostname: 'PC-01' };
  const secureKey = 'test-secure-key';
  let activeServices = [];

  beforeEach(() => {
    vi.clearAllMocks();
    mockSocket = {
      on: vi.fn(),
      emit: vi.fn(),
      connected: true,
      close: vi.fn()
    };
    io.mockReturnValue(mockSocket);
    vi.useRealTimers();
  });

  afterEach(() => {
    for (const service of activeServices) {
      try {
        service.close();
      } catch {}
    }
    activeServices = [];
    vi.useRealTimers();
    delete process.env.NODE_ENV;
    delete process.env.SENTRIX_VERIFY_SSL;
  });

  function signCommand(command, args = {}, timestamp = Date.now(), commandId = crypto.randomUUID()) {
    const data = { command, args, commandId };
    const payload = JSON.stringify(data) + timestamp;
    const hmac = crypto
      .createHmac('sha256', secureKey)
      .update(payload)
      .digest('hex');

    return { data, hmac, timestamp };
  }

  async function getRegisteredCommandHandler() {
    const service = connectToCore({ serverUrl: 'https://localhost:4000', profile: mockProfile });
    activeServices.push(service);

    mockSocket.emit.mockImplementationOnce((event, payload, callback) => {
      if (event === 'agent:register') {
        callback?.({ success: true, secureKey });
      }
    });

    const connectHandler = mockSocket.on.mock.calls.find(call => call[0] === 'connect')[1];
    await connectHandler();
    return mockSocket.on.mock.calls.find(call => call[0] === 'agent:command')[1];
  }

  it('should register agent on connect and set ready state', async () => {
    const service = connectToCore({ serverUrl: 'https://localhost:4000', profile: mockProfile });
    activeServices.push(service);

    mockSocket.emit.mockImplementationOnce((event, payload, callback) => {
      if (event === 'agent:register') {
        callback?.({ success: true, secureKey });
      }
    });

    const connectHandler = mockSocket.on.mock.calls.find(call => call[0] === 'connect')[1];
    await connectHandler();

    expect(mockSocket.emit).toHaveBeenCalledWith('agent:register', expect.objectContaining({
      ...mockProfile,
      fingerprint: expect.any(String)
    }), expect.any(Function));

    expect(service.isConnected()).toBe(true);
  });

  it('should reject commands with invalid HMAC', async () => {
    const commandHandler = await getRegisteredCommandHandler();
    const callback = vi.fn();
    const cmd = signCommand('restart');
    cmd.hmac = 'invalidhmac';

    await commandHandler(cmd, callback);

    expect(callback).toHaveBeenCalledWith({
      success: false,
      message: 'Command signature verification failed.'
    });
  });

  it('should reject expired command signatures', async () => {
    const commandHandler = await getRegisteredCommandHandler();
    const callback = vi.fn();
    const expiredTimestamp = Date.now() - (10 * 60 * 1000); // 10 minutes ago
    const cmd = signCommand('restart', {}, expiredTimestamp);

    await commandHandler(cmd, callback);

    expect(callback).toHaveBeenCalledWith({
      success: false,
      message: 'Command signature expired.'
    });
  });

  it('should reject duplicate command IDs (replay attack protection)', async () => {
    const commandHandler = await getRegisteredCommandHandler();
    const callback1 = vi.fn();
    const callback2 = vi.fn();
    const commandId = crypto.randomUUID();
    const cmd = signCommand('restart', {}, Date.now(), commandId);

    await commandHandler(cmd, callback1);
    expect(callback1).toHaveBeenCalledWith(expect.objectContaining({ success: true }));

    // Replay same commandId
    await commandHandler(cmd, callback2);
    expect(callback2).toHaveBeenCalledWith({
      success: false,
      message: 'Duplicate command ID (replay detected).'
    });
  });

  it('should invalidate registration on disconnect', async () => {
    const service = connectToCore({ serverUrl: 'https://localhost:4000', profile: mockProfile });
    activeServices.push(service);

    mockSocket.emit.mockImplementationOnce((event, payload, callback) => {
      if (event === 'agent:register') {
        callback?.({ success: true, secureKey });
      }
    });

    const connectHandler = mockSocket.on.mock.calls.find(call => call[0] === 'connect')[1];
    await connectHandler();
    expect(service.isConnected()).toBe(true);

    const disconnectHandler = mockSocket.on.mock.calls.find(call => call[0] === 'disconnect')[1];
    disconnectHandler();

    expect(service.isConnected()).toBe(false);
  });

  it('should handle socket close and prevent reconnection/discovery', async () => {
    const service = connectToCore({ serverUrl: 'https://localhost:4000', profile: mockProfile });
    activeServices.push(service);
    service.close();

    expect(mockSocket.close).toHaveBeenCalled();
    expect(service.isConnected()).toBe(false);
  });

  it('should handle kill-process command successfully', async () => {
    const commandHandler = await getRegisteredCommandHandler();
    killProcess.mockResolvedValue({ success: true });
    const callback = vi.fn();

    await commandHandler(signCommand('kill-process', { pid: 1234 }), callback);

    expect(killProcess).toHaveBeenCalledWith(1234);
    expect(callback).toHaveBeenCalledWith({ success: true });
  });

  it('should cache metrics before registration and emit afterward', async () => {
    const service = connectToCore({ serverUrl: 'https://localhost:4000', profile: mockProfile });
    activeServices.push(service);

    // Call sendMetrics before registration
    service.sendMetrics({ cpu: 45 }, { details: true });
    expect(mockSocket.emit).not.toHaveBeenCalledWith('agent:metrics', expect.any(Object));

    // Now trigger connect and registration
    mockSocket.emit.mockImplementationOnce((event, payload, callback) => {
      if (event === 'agent:register') {
        callback?.({ success: true, secureKey });
      }
    });
    // Subsequent emit for metrics
    mockSocket.emit.mockImplementation((event, payload, callback) => {
      if (event === 'agent:metrics') {
        callback?.({ success: true });
      }
    });

    const connectHandler = mockSocket.on.mock.calls.find(call => call[0] === 'connect')[1];
    await connectHandler();

    expect(mockSocket.emit).toHaveBeenCalledWith('agent:metrics', expect.objectContaining({
      data: expect.objectContaining({ type: 'metrics' }),
      hmac: expect.any(String),
      timestamp: expect.any(Number)
    }), expect.any(Function));
  });

  it('should ignore stale registration callbacks after disconnect', async () => {
    const onStatus = vi.fn();
    const service = connectToCore({ serverUrl: 'https://localhost:4000', profile: mockProfile, onStatus });
    activeServices.push(service);

    let registeredCallback;
    mockSocket.emit.mockImplementation((event, payload, callback) => {
      if (event === 'agent:register') {
        registeredCallback = callback;
      }
    });

    const connectHandler = mockSocket.on.mock.calls.find(call => call[0] === 'connect')[1];
    await connectHandler();

    const disconnectHandler = mockSocket.on.mock.calls.find(call => call[0] === 'disconnect')[1];
    disconnectHandler(); // Increments connectionGeneration and clears registration

    expect(service.isConnected()).toBe(false);

    // Invoke stale callback from previous connection generation
    registeredCallback?.({ success: true, secureKey });

    expect(service.isConnected()).toBe(false);
    expect(onStatus).not.toHaveBeenCalledWith(expect.objectContaining({ connection: 'online' }));
  });

  it('should handle fingerprint acquisition failure gracefully', async () => {
    getHardwareFingerprint.mockRejectedValueOnce(new Error('Fingerprint failure'));
    const service = connectToCore({ serverUrl: 'https://localhost:4000', profile: mockProfile });
    activeServices.push(service);

    const connectHandler = mockSocket.on.mock.calls.find(call => call[0] === 'connect')[1];
    await connectHandler();

    expect(service.isConnected()).toBe(false);
  });

  it('should handle registration failure gracefully', async () => {
    const service = connectToCore({ serverUrl: 'https://localhost:4000', profile: mockProfile });
    activeServices.push(service);

    mockSocket.emit.mockImplementationOnce((event, payload, callback) => {
      if (event === 'agent:register') {
        callback?.({ success: false, message: 'Unauthorized agent' });
      }
    });

    const connectHandler = mockSocket.on.mock.calls.find(call => call[0] === 'connect')[1];
    await connectHandler();

    expect(service.isConnected()).toBe(false);
  });

  it('should retry fingerprint/registration on failure using fake timers', async () => {
    vi.useFakeTimers();

    getHardwareFingerprint.mockRejectedValueOnce(new Error('Transient fingerprint error'))
                           .mockResolvedValueOnce('test-fingerprint');

    const service = connectToCore({ serverUrl: 'https://localhost:4000', profile: mockProfile });
    activeServices.push(service);

    const connectHandler = mockSocket.on.mock.calls.find(call => call[0] === 'connect')[1];
    await connectHandler();

    expect(getHardwareFingerprint).toHaveBeenCalledTimes(1);

    // Advance timers by backoff (2000ms)
    await vi.advanceTimersByTimeAsync(2000);

    expect(getHardwareFingerprint).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('should handle command execution exceptions safely', async () => {
    const commandHandler = await getRegisteredCommandHandler();
    killProcess.mockRejectedValueOnce(new Error('Process error'));
    const callback = vi.fn();

    await commandHandler(signCommand('kill-process', { pid: 9999 }), callback);

    expect(callback).toHaveBeenCalledWith({ success: false, message: 'Command execution error: Process error' });
  });

  it('should reject invalid or non-finite timestamps', async () => {
    const commandHandler = await getRegisteredCommandHandler();
    const callback = vi.fn();
    const cmd = signCommand('restart');
    cmd.timestamp = 'invalid-timestamp'; // Non-numeric string

    await commandHandler(cmd, callback);

    expect(callback).toHaveBeenCalledWith({
      success: false,
      message: 'Signed command required with valid numeric timestamp.'
    });
  });

  it('should enforce replay-cache capacity without evicting unexpired entries', async () => {
    const commandHandler = await getRegisteredCommandHandler();
    const callback1 = vi.fn();
    const callback2 = vi.fn();

    // Fill replay cache up to 1000 entries with unique commandIds
    for (let i = 0; i < 1000; i++) {
      const id = `cmd-id-${i}`;
      const cmd = signCommand('restart', {}, Date.now(), id);
      await commandHandler(cmd, vi.fn());
    }

    // Try sending 1001st unique command ID when cache is full
    const overflowCmd = signCommand('restart', {}, Date.now(), 'cmd-id-overflow');
    await commandHandler(overflowCmd, callback1);

    expect(callback1).toHaveBeenCalledWith({
      success: false,
      message: 'Command replay cache capacity exceeded.'
    });

    // Verify earlier unexpired entry (e.g. cmd-id-0) is STILL in cache (replay rejected)
    const originalCmd = signCommand('restart', {}, Date.now(), 'cmd-id-0');
    await commandHandler(originalCmd, callback2);

    expect(callback2).toHaveBeenCalledWith({
      success: false,
      message: 'Duplicate command ID (replay detected).'
    });
  });

  it('should execute power command successfully via mock', async () => {
    const commandHandler = await getRegisteredCommandHandler();
    runRemotePowerCommand.mockResolvedValueOnce({ success: true, message: 'Restart initiated' });
    const callback = vi.fn();

    await commandHandler(signCommand('restart'), callback);

    expect(runRemotePowerCommand).toHaveBeenCalledWith('restart');
    expect(callback).toHaveBeenCalledWith({ success: true, message: 'Restart initiated' });
  });

  describe('TLS Verification Defaults (rejectUnauthorized matrix)', () => {
    it('should enable TLS verification in production with no override', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.SENTRIX_VERIFY_SSL;
      const service = connectToCore({ serverUrl: 'https://localhost:4000', profile: mockProfile });
      activeServices.push(service);

      const ioOptions = io.mock.calls[io.mock.calls.length - 1][1];
      expect(ioOptions.rejectUnauthorized).toBe(true);
    });

    it('should enable TLS verification in production even if SENTRIX_VERIFY_SSL=false', async () => {
      process.env.NODE_ENV = 'production';
      process.env.SENTRIX_VERIFY_SSL = 'false';
      const service = connectToCore({ serverUrl: 'https://localhost:4000', profile: mockProfile });
      activeServices.push(service);

      const ioOptions = io.mock.calls[io.mock.calls.length - 1][1];
      expect(ioOptions.rejectUnauthorized).toBe(true);
    });

    it('should enable TLS verification in development when no override is set', async () => {
      process.env.NODE_ENV = 'development';
      delete process.env.SENTRIX_VERIFY_SSL;
      const service = connectToCore({ serverUrl: 'https://localhost:4000', profile: mockProfile });
      activeServices.push(service);

      const ioOptions = io.mock.calls[io.mock.calls.length - 1][1];
      expect(ioOptions.rejectUnauthorized).toBe(true);
    });

    it('should disable TLS verification in development only when SENTRIX_VERIFY_SSL=false explicitly', async () => {
      process.env.NODE_ENV = 'development';
      process.env.SENTRIX_VERIFY_SSL = 'false';
      const service = connectToCore({ serverUrl: 'https://localhost:4000', profile: mockProfile });
      activeServices.push(service);

      const ioOptions = io.mock.calls[io.mock.calls.length - 1][1];
      expect(ioOptions.rejectUnauthorized).toBe(false);
    });
  });
});
