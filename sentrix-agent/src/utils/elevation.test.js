import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isAdmin, isSystem, elevate, quoteArg } from './elevation.js';
import { execSync } from 'child_process';

vi.mock('child_process', () => ({
  execSync: vi.fn()
}));

describe('Elevation Utility', () => {
  const originalPlatform = process.platform;
  const originalArgv = process.argv;
  const originalExit = process.exit;

  beforeEach(() => {
    vi.clearAllMocks();
    process.exit = vi.fn();
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    process.argv = originalArgv;
    process.exit = originalExit;
  });

  describe('isAdmin()', () => {
    it('should return true on non-Windows platforms', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      expect(isAdmin()).toBe(true);
    });

    it('should return true when .NET WindowsPrincipal indicates admin', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      execSync.mockReturnValueOnce({ stdout: 'True\r\n' });

      expect(isAdmin()).toBe(true);
      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('powershell -NoProfile -NonInteractive -EncodedCommand'),
        expect.any(Object)
      );
    });

    it('should fallback to net session when .NET check throws', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      execSync.mockImplementationOnce(() => { throw new Error('PowerShell error'); })
             .mockReturnValueOnce({ stdout: '' }); // net session success

      expect(isAdmin()).toBe(true);
      expect(execSync).toHaveBeenCalledTimes(2);
      expect(execSync).toHaveBeenNthCalledWith(2, 'net session', expect.any(Object));
    });

    it('should return false when both .NET and net session fail', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      execSync.mockImplementation(() => { throw new Error('Access denied'); });

      expect(isAdmin()).toBe(false);
    });
  });

  describe('isSystem()', () => {
    it('should return false on non-Windows platforms', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      expect(isSystem()).toBe(false);
    });

    it('should return true when .NET WindowsIdentity User SID is S-1-5-18', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      execSync.mockReturnValueOnce({ stdout: 'True\r\n' });

      expect(isSystem()).toBe(true);
    });

    it('should fallback to whoami /user when .NET check throws', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      execSync.mockImplementationOnce(() => { throw new Error('PS error'); })
             .mockReturnValueOnce({ stdout: '"NT AUTHORITY\\SYSTEM","S-1-5-18"\n' });

      expect(isSystem()).toBe(true);
    });

    it('should return false when not SYSTEM', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      execSync.mockImplementationOnce(() => { throw new Error('PS error'); })
             .mockReturnValueOnce({ stdout: '"WORKSTATION\\User","S-1-5-21-..."\n' });

      expect(isSystem()).toBe(false);
    });
  });

  describe('quoteArg() Windows Argument Quoting', () => {
    it('should handle simple unquoted arguments', () => {
      expect(quoteArg('simple')).toBe('simple');
    });

    it('should quote arguments containing spaces', () => {
      expect(quoteArg('arg with spaces')).toBe('"arg with spaces"');
    });

    it('should escape embedded double quotes and preceding backslashes', () => {
      expect(quoteArg('arg"quotes')).toBe('"arg\\"quotes"');
      expect(quoteArg('path\\with\\"quote')).toBe('"path\\with\\\\\\"quote"');
    });

    it('should preserve trailing backslashes without escaping when no quotes follow', () => {
      expect(quoteArg('C:\\path\\')).toBe('C:\\path\\');
    });

    it('should handle empty arguments', () => {
      expect(quoteArg('')).toBe('""');
      expect(quoteArg(null)).toBe('""');
    });

    it('should handle single quotes and PowerShell-special characters', () => {
      expect(quoteArg("arg'with$special`chars")).toBe('arg\'with$special`chars');
    });
  });

  describe('elevate()', () => {
    it('should return false on non-Windows platforms', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      expect(elevate()).toBe(false);
    });

    it('should return false if already admin or SYSTEM', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      execSync.mockReturnValueOnce({ stdout: 'True\r\n' });

      expect(elevate()).toBe(false);
    });

    it('should relaunch process and exit when unelevated, properly quoting arguments', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      execSync.mockReturnValue({ stdout: 'False\r\n' });

      process.argv = ['C:\\path\\agent.exe', 'arg1', 'arg with spaces', 'arg"quotes', 'path\\trailing\\', ''];

      elevate();

      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('powershell -NoProfile -NonInteractive -EncodedCommand'),
        { stdio: 'ignore' }
      );

      // Verify encoded command decodes and contains ProcessStartInfo configuration
      const callArg = execSync.mock.calls[execSync.mock.calls.length - 1][0];
      const match = callArg.match(/-EncodedCommand\s+([A-Za-z0-9+/=]+)/);
      expect(match).toBeTruthy();
      const decodedScript = Buffer.from(match[1], 'base64').toString('utf16le');

      expect(decodedScript).toContain('System.Diagnostics.ProcessStartInfo');
      expect(decodedScript).toContain("Verb = 'runas'");
      expect(decodedScript).toContain('arg with spaces');
      expect(decodedScript).toContain('arg\\"quotes');

      expect(process.exit).toHaveBeenCalledWith(0);
    });
  });
});
