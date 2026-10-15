import { describe, it, expect, beforeEach, vi } from "vitest";
import * as auditService from "../../src/modules/audit/audit.service.js";
import * as securityService from "../../src/modules/security/security.service.js";

vi.mock("../../src/modules/audit/audit.repository.js", () => ({
  AuditRepository: {
    insertLog: vi.fn(),
    findLogs: vi.fn(),
    findLogById: vi.fn(),
  },
}));

vi.mock("../../src/modules/security/security.service.js", () => ({
  revokeAuthority: vi.fn(),
  authorizeDevice: vi.fn(),
  blacklistDevice: vi.fn(),
  getSecurityIdentities: vi.fn(),
}));

describe("Audit service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("revokeAuthorityRecord", () => {
    it("propagates the target parameter to security service", async () => {
      const mockId = "record-123";
      const options = { revokedBy: "admin-1", reason: "testing", target: "ip" };

      await auditService.revokeAuthorityRecord(mockId, options);

      expect(securityService.revokeAuthority).toHaveBeenCalledWith(
        mockId,
        expect.objectContaining({ target: "ip" }),
      );
    });

    it("defaults target to all if not provided", async () => {
      const mockId = "record-456";

      await auditService.revokeAuthorityRecord(mockId);

      expect(securityService.revokeAuthority).toHaveBeenCalledWith(
        mockId,
        expect.objectContaining({ target: "all" }),
      );
    });
  });
});
