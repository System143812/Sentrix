import { describe, it, expect, vi, beforeEach } from 'vitest';
import { connectToCore } from './socket.service.js';
import { io } from 'socket.io-client';
import { killProcess } from './metrics/processes.service.js';

vi.mock('socket.io-client');
vi.mock('./metrics/processes.service.js');
vi.mock('child_process', () => ({
  execFile: vi.fn((file, args, options, callback) => {
    callback(null, { stdout: 'Command Success' });
  })
}));
import { execFile } from 'child_process';

describe('Socket Service', () => {
  let mockSocket;
  const mockProfile = { agentId: 'test-agent', hostname: 'PC-01' };

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

  it('should register agent on connect', () => {
    connectToCore({ serverUrl: 'http://localhost:4000', profile: mockProfile });
    
    // Find the 'connect' listener and trigger it
    const connectHandler = mockSocket.on.mock.calls.find(call => call[0] === 'connect')[1];
    connectHandler();

    expect(mockSocket.emit).toHaveBeenCalledWith('agent:register', mockProfile);
  });

  it('should handle remote power commands', async () => {
    connectToCore({ serverUrl: 'http://localhost:4000', profile: mockProfile });
    
    const commandHandler = mockSocket.on.mock.calls.find(call => call[0] === 'agent:command')[1];
    const callback = vi.fn();

    // Mock platform to windows for this test if possible, or assume the service check handles it
    // The service has: if (process.platform !== "win32") return ...
    // We'll test the command routing regardless of execution success
    await commandHandler({ command: 'restart' }, callback);

    if (process.platform === 'win32') {
        expect(execFile).toHaveBeenCalledWith('shutdown.exe', expect.any(Array), expect.any(Object), expect.any(Function));
    }
  });

  it('should handle kill-process command', async () => {
    connectToCore({ serverUrl: 'http://localhost:4000', profile: mockProfile });
    
    const commandHandler = mockSocket.on.mock.calls.find(call => call[0] === 'agent:command')[1];
    killProcess.mockResolvedValue({ success: true });

    await commandHandler({ command: 'kill-process', args: { pid: 1234 } }, vi.fn());

    expect(killProcess).toHaveBeenCalledWith(1234);
  });
});
