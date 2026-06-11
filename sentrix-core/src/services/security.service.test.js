import { describe, it, expect, beforeEach, vi } from "vitest";
import pool from "../lib/database.js";
import * as securityService from "./security.service.js";
import crypto from "crypto";

// Mock the database pool
vi.mock("../lib/database.js", () => ({
  default: {
    query: vi.fn(),
  },
}));

describe("Security Service (Hardware Identity)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("generateProvisioningToken", () => {
    it("should generate a 64-char token and upsert a pending client row", async () => {
      const clientId = "agent-123";
      const token = await securityService.generateProvisioningToken(clientId);

      expect(token).toHaveLength(64);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO clients"),
        expect.arrayContaining([
          clientId,
          clientId,
          "Pending Agent agent-12",
          JSON.stringify({}),
          JSON.stringify({}),
          token,
          expect.any(Number),
          expect.any(Number),
          expect.any(Number),
        ])
      );
      expect(pool.query.mock.calls[0][0]).toContain("ON DUPLICATE KEY UPDATE");
    });
  });

  describe("bindHardwareFingerprint", () => {
    const clientId = "agent-123";
    const fingerprint = "disk-cpu-mb-fingerprint";

    it("should allow binding with a valid token", async () => {
      const validToken = "valid-otp-123";
      pool.query.mockResolvedValueOnce([[{ 
        provisioning_token: validToken, 
        token_expires_at: Date.now() + 10000 
      }]]);

      const result = await securityService.bindHardwareFingerprint(clientId, fingerprint, validToken);

      expect(result).toBeDefined();
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE clients SET hardware_fingerprint = ?"),
        expect.any(Array)
      );
    });

    it("should reject binding with an invalid token", async () => {
      pool.query.mockResolvedValueOnce([[{ 
        provisioning_token: "other-token", 
        token_expires_at: Date.now() + 10000 
      }]]);

      await expect(securityService.bindHardwareFingerprint(clientId, fingerprint, "wrong-token"))
        .rejects.toThrow("Invalid provisioning token.");
    });

    it("should reject binding with an expired token", async () => {
      const expiredToken = "old-token";
      pool.query.mockResolvedValueOnce([[{ 
        provisioning_token: expiredToken, 
        token_expires_at: Date.now() - 1000 
      }]]);

      await expect(securityService.bindHardwareFingerprint(clientId, fingerprint, expiredToken))
        .rejects.toThrow("Provisioning token has expired.");
    });

    it("should verify existing fingerprint if no token provided", async () => {
      const salt = "sentrix_default_secure_secret_2024";
      const expectedSecureKey = crypto.createHmac("sha256", salt).update(fingerprint).digest("hex");

      pool.query.mockResolvedValueOnce([[{ 
        hardware_fingerprint: expectedSecureKey,
        provisioning_token: null 
      }]]);

      const result = await securityService.bindHardwareFingerprint(clientId, fingerprint, null);
      expect(result).toBe(expectedSecureKey);
    });

    it("should reject mismatching fingerprint (potential clone)", async () => {
      pool.query.mockResolvedValueOnce([[{ 
        hardware_fingerprint: "locked-to-other-hardware",
        provisioning_token: null 
      }]]);

      await expect(securityService.bindHardwareFingerprint(clientId, fingerprint, null))
        .rejects.toThrow("Hardware identity mismatch.");
    });
  });

  describe("verifyHardwareSignature", () => {
    const clientId = "agent-123";
    const storedFingerprint = "secure-key-abc";
    const data = { cpu: 50, ram: 2048 };
    const timestamp = Date.now();

    it("should verify a valid signature", async () => {
      const payload = JSON.stringify(data) + timestamp;
      const validHmac = crypto.createHmac("sha256", storedFingerprint).update(payload).digest("hex");

      pool.query.mockResolvedValueOnce([[{ hardware_fingerprint: storedFingerprint }]]);

      const isValid = await securityService.verifyHardwareSignature(clientId, data, validHmac, timestamp);
      expect(isValid).toBe(true);
    });

    it("should reject an invalid signature", async () => {
      pool.query.mockResolvedValueOnce([[{ hardware_fingerprint: storedFingerprint }]]);

      const isValid = await securityService.verifyHardwareSignature(clientId, data, "fake-hmac", timestamp);
      expect(isValid).toBe(false);
    });

    it("should reject signature with high timestamp drift (replay protection)", async () => {
      const oldTimestamp = Date.now() - (10 * 60 * 1000); // 10 mins ago
      const payload = JSON.stringify(data) + oldTimestamp;
      const validHmac = crypto.createHmac("sha256", storedFingerprint).update(payload).digest("hex");

      pool.query.mockResolvedValueOnce([[{ hardware_fingerprint: storedFingerprint }]]);

      const isValid = await securityService.verifyHardwareSignature(clientId, data, validHmac, oldTimestamp);
      expect(isValid).toBe(false);
    });
  });

  describe("signAgentCommand", () => {
    it("should sign an outbound agent command with the bound hardware key", async () => {
      const clientId = "agent-123";
      const hardwareKey = "secure-key-abc";
      const now = 1781140000000;
      const dateSpy = vi.spyOn(Date, "now").mockReturnValue(now);
      pool.query.mockResolvedValueOnce([[{ hardware_fingerprint: hardwareKey }]]);

      const signed = await securityService.signAgentCommand(clientId, "restart", { senderRole: "admin" });
      const expectedHmac = crypto
        .createHmac("sha256", hardwareKey)
        .update(JSON.stringify(signed.data) + now)
        .digest("hex");

      expect(signed).toEqual({
        data: { command: "restart", args: { senderRole: "admin" } },
        hmac: expectedHmac,
        timestamp: now,
      });
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining("SELECT hardware_fingerprint"),
        [clientId],
      );
      dateSpy.mockRestore();
    });

    it("should reject command signing for an unbound agent", async () => {
      pool.query.mockResolvedValueOnce([[{ hardware_fingerprint: null }]]);

      await expect(securityService.signAgentCommand("agent-123", "restart"))
        .rejects.toThrow("hardware identity is not bound");
    });
  });
});

describe("Security Service (Legacy Core Logic)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("isRequestRateLimited", () => {
    it("should return true if IP is blocked", async () => {
      const mockReq = {
        headers: { 
          "x-forwarded-for": "1.2.3.4",
          "x-client-mac": "AABBCCDDEEFF"
        },
        user: { id: "user-123" }
      };

      pool.query.mockResolvedValueOnce([[{ id: 1 }]]);

      const result = await securityService.isRequestRateLimited(mockReq);
      
      expect(result).toBe(true);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining("ip_address = ?"),
        expect.arrayContaining(["1.2.3.4"])
      );
    });
  });

  describe("revokeAuthority", () => {
    it("should update block_target to 'mac' when unblocking IP from 'all'", async () => {
      const mockId = 123;
      const mockSubject = {
        id: mockId,
        block_target: "all",
        category: "blacklist"
      };

      pool.query
        .mockResolvedValueOnce([[mockSubject]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      await securityService.revokeAuthority(mockId, { target: "ip" });

      expect(pool.query).toHaveBeenLastCalledWith(
        expect.stringMatching(/SET\s+active\s+=\s+\?,\s+block_target\s+=\s+\?/),
        expect.arrayContaining([1, "mac", expect.any(Number), null, "", 123])
      );
    });
  });
});
