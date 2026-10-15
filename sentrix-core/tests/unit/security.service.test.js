import { describe, it, expect, beforeEach, vi } from "vitest";
import crypto from "crypto";
import * as securityService from "../../src/modules/security/security.service.js";
import { SecurityRepository } from "../../src/modules/security/security.repository.js";

vi.mock("../../src/modules/security/security.repository.js", () => ({
  SecurityRepository: {
    upsertPendingProvisioningClient: vi.fn(),
    findClientHardwareBinding: vi.fn(),
    bindClientHardwareFingerprintWithToken: vi.fn(),
    updateClientHardwareFingerprint: vi.fn(),
    findClientHardwareFingerprint: vi.fn(),
    findDiscoveryMacByIp: vi.fn(),
    findRateLimitedAuthority: vi.fn(),
    findWhitelistAuthority: vi.fn(),
    findProvisionedClient: vi.fn(),
    findActiveClientByAgentId: vi.fn(),
    upsertWhitelistedAuthority: vi.fn(),
    findMacRateLimit: vi.fn(),
    findUserRateLimit: vi.fn(),
    findSecurityIdentities: vi.fn(),
    findAuthorityById: vi.fn(),
    updateAuthorityRevocation: vi.fn(),
    upsertRateLimitAuthority: vi.fn(),
    upsertBlacklistedAuthority: vi.fn(),
    insertSecurityIncident: vi.fn(),
    countSecurityIncidents: vi.fn(),
    deleteSecurityIncidents: vi.fn(),
  },
}));

describe("Security service hardware identity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("generates a provisioning token and upserts a pending client row", async () => {
    const clientId = "agent-123";

    const token = await securityService.generateProvisioningToken(clientId);

    expect(token).toHaveLength(64);
    expect(SecurityRepository.upsertPendingProvisioningClient).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId,
        pendingHostname: "Pending Agent agent-12",
        token,
        expiresAt: expect.any(Number),
        now: expect.any(Number),
      }),
    );
  });

  it("binds hardware with a valid token", async () => {
    const clientId = "agent-123";
    const fingerprint = "disk-cpu-mb-fingerprint";
    const validToken = "valid-otp-123";
    SecurityRepository.findClientHardwareBinding.mockResolvedValue({
      provisioning_token: validToken,
      token_expires_at: Date.now() + 10000,
    });

    const result = await securityService.bindHardwareFingerprint(
      clientId,
      fingerprint,
      validToken,
    );

    expect(result).toBeDefined();
    expect(SecurityRepository.bindClientHardwareFingerprintWithToken).toHaveBeenCalledWith(
      clientId,
      result,
    );
  });

  it("rejects binding with an invalid token", async () => {
    SecurityRepository.findClientHardwareBinding.mockResolvedValue({
      provisioning_token: "other-token",
      token_expires_at: Date.now() + 10000,
    });

    await expect(
      securityService.bindHardwareFingerprint("agent-123", "fingerprint", "wrong-token"),
    ).rejects.toThrow("Invalid provisioning token.");
  });

  it("rejects binding with an expired token", async () => {
    SecurityRepository.findClientHardwareBinding.mockResolvedValue({
      provisioning_token: "old-token",
      token_expires_at: Date.now() - 1000,
    });

    await expect(
      securityService.bindHardwareFingerprint("agent-123", "fingerprint", "old-token"),
    ).rejects.toThrow("Provisioning token has expired.");
  });

  it("verifies existing fingerprint if no token is provided", async () => {
    const fingerprint = "disk-cpu-mb-fingerprint";
    const expectedSecureKey = crypto
      .createHmac("sha256", "sentrix_default_secure_secret_2024")
      .update(fingerprint)
      .digest("hex");
    SecurityRepository.findClientHardwareBinding.mockResolvedValue({
      hardware_fingerprint: expectedSecureKey,
      provisioning_token: null,
    });

    const result = await securityService.bindHardwareFingerprint(
      "agent-123",
      fingerprint,
      null,
    );

    expect(result).toBe(expectedSecureKey);
  });

  it("rejects mismatching fingerprint", async () => {
    SecurityRepository.findClientHardwareBinding.mockResolvedValue({
      hardware_fingerprint: "locked-to-other-hardware",
      provisioning_token: null,
    });

    await expect(
      securityService.bindHardwareFingerprint("agent-123", "fingerprint", null),
    ).rejects.toThrow("Hardware identity mismatch.");
  });

  it("verifies a valid hardware signature", async () => {
    const clientId = "agent-123";
    const storedFingerprint = "secure-key-abc";
    const data = { cpu: 50, ram: 2048 };
    const timestamp = Date.now();
    const payload = JSON.stringify(data) + timestamp;
    const validHmac = crypto
      .createHmac("sha256", storedFingerprint)
      .update(payload)
      .digest("hex");
    SecurityRepository.findClientHardwareFingerprint.mockResolvedValue({
      hardware_fingerprint: storedFingerprint,
    });

    const isValid = await securityService.verifyHardwareSignature(
      clientId,
      data,
      validHmac,
      timestamp,
    );

    expect(isValid).toBe(true);
  });

  it("rejects an invalid hardware signature", async () => {
    SecurityRepository.findClientHardwareFingerprint.mockResolvedValue({
      hardware_fingerprint: "secure-key-abc",
    });

    const isValid = await securityService.verifyHardwareSignature(
      "agent-123",
      { cpu: 50 },
      "fake-hmac",
      Date.now(),
    );

    expect(isValid).toBe(false);
  });

  it("rejects signatures with high timestamp drift", async () => {
    const oldTimestamp = Date.now() - 10 * 60 * 1000;
    const storedFingerprint = "secure-key-abc";
    const data = { cpu: 50 };
    const validHmac = crypto
      .createHmac("sha256", storedFingerprint)
      .update(JSON.stringify(data) + oldTimestamp)
      .digest("hex");
    SecurityRepository.findClientHardwareFingerprint.mockResolvedValue({
      hardware_fingerprint: storedFingerprint,
    });

    const isValid = await securityService.verifyHardwareSignature(
      "agent-123",
      data,
      validHmac,
      oldTimestamp,
    );

    expect(isValid).toBe(false);
  });

  it("signs an outbound agent command with the bound hardware key", async () => {
    const hardwareKey = "secure-key-abc";
    const now = 1781140000000;
    const dateSpy = vi.spyOn(Date, "now").mockReturnValue(now);
    SecurityRepository.findClientHardwareFingerprint.mockResolvedValue({
      hardware_fingerprint: hardwareKey,
    });

    const signed = await securityService.signAgentCommand("agent-123", "restart", {
      senderRole: "admin",
    });
    const expectedHmac = crypto
      .createHmac("sha256", hardwareKey)
      .update(JSON.stringify(signed.data) + now)
      .digest("hex");

    expect(signed).toEqual({
      data: { command: "restart", args: { senderRole: "admin" } },
      hmac: expectedHmac,
      timestamp: now,
    });
    expect(SecurityRepository.findClientHardwareFingerprint).toHaveBeenCalledWith(
      "agent-123",
      { includeArchived: false },
    );
    dateSpy.mockRestore();
  });

  it("rejects command signing for an unbound agent", async () => {
    SecurityRepository.findClientHardwareFingerprint.mockResolvedValue({
      hardware_fingerprint: null,
    });

    await expect(
      securityService.signAgentCommand("agent-123", "restart"),
    ).rejects.toThrow("hardware identity is not bound");
  });
});

describe("Security service core policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true if a request is rate limited", async () => {
    SecurityRepository.findRateLimitedAuthority.mockResolvedValue([{ id: 1 }]);

    const result = await securityService.isRequestRateLimited({
      headers: {
        "x-forwarded-for": "1.2.3.4",
        "x-client-mac": "AABBCCDDEEFF",
      },
      user: { id: "user-123" },
    });

    expect(result).toBe(true);
    expect(SecurityRepository.findRateLimitedAuthority).toHaveBeenCalledWith(
      expect.objectContaining({
        ip: "1.2.3.4",
        mac: "AABBCCDDEEFF",
        userIds: ["user-123"],
      }),
    );
  });

  it("updates block target to mac when unblocking IP from all", async () => {
    const subject = {
      id: 123,
      block_target: "all",
      category: "blacklist",
    };
    SecurityRepository.findAuthorityById.mockResolvedValue(subject);

    await securityService.revokeAuthority(123, { target: "ip" });

    expect(SecurityRepository.updateAuthorityRevocation).toHaveBeenCalledWith({
      id: 123,
      active: 1,
      blockTarget: "mac",
      revokedAt: expect.any(Number),
      revokedBy: null,
      reason: "",
    });
  });
});
