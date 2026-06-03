import { describe, it, expect, beforeEach, vi } from "vitest";
import * as auditService from "./audit.service.js";
import * as securityService from "./security.service.js";

// Mock the security service
vi.mock("./security.service.js", () => ({
  revokeAuthority: vi.fn(),
  authorizeDevice: vi.fn(),
  blacklistDevice: vi.fn(),
  getSecurityIdentities: vi.fn(),
}));

describe("Audit Service (Propagation)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("revokeAuthorityRecord", () => {
    it("should correctly propagate the 'target' parameter to security service", async () => {
      const mockId = "record-123";
      const options = { revokedBy: "admin-1", reason: "testing", target: "ip" };

      await auditService.revokeAuthorityRecord(mockId, options);

      expect(securityService.revokeAuthority).toHaveBeenCalledWith(
        mockId,
        expect.objectContaining({ target: "ip" })
      );
    });

    it("should default target to 'all' if not provided", async () => {
      const mockId = "record-456";
      
      await auditService.revokeAuthorityRecord(mockId);

      expect(securityService.revokeAuthority).toHaveBeenCalledWith(
        mockId,
        expect.objectContaining({ target: "all" })
      );
    });
  });
});
