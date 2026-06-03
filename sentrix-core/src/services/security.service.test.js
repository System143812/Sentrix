import { describe, it, expect, beforeEach, vi } from "vitest";
import pool from "../lib/database.js";
import * as securityService from "./security.service.js";

// Mock the database pool
vi.mock("../lib/database.js", () => ({
  default: {
    query: vi.fn(),
  },
}));

describe("Security Service (Unified Logic)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("isRequestRateLimited", () => {
    it("should return true if IP is blocked", async () => {
      const mockReq = {
        headers: { 
          "x-forwarded-for": "1.2.3.4",
          "x-client-mac": "AABBCCDDEEFF" // Provide MAC to avoid resolveMacFromIp call
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

    it("should handle empty user identifiers without SQL error", async () => {
      const mockReq = {
        headers: { 
          "x-forwarded-for": "1.2.3.4",
          "x-client-mac": "AABBCCDDEEFF"
        },
        user: null
      };

      pool.query.mockResolvedValueOnce([[]]);

      const result = await securityService.isRequestRateLimited(mockReq);
      
      expect(result).toBe(false);
      expect(pool.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([["__NONE__"]])
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
        .mockResolvedValueOnce([[mockSubject]]) // 1. Get subject
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // 2. Update

      await securityService.revokeAuthority(mockId, { target: "ip" });

      expect(pool.query).toHaveBeenLastCalledWith(
        expect.stringMatching(/SET\s+active\s+=\s+\?,\s+block_target\s+=\s+\?/),
        expect.arrayContaining([1, "mac", expect.any(Number), null, "", 123])
      );
    });

    it("should set active = 0 when unblocking everything", async () => {
      const mockId = 123;
      const mockSubject = {
        id: mockId,
        block_target: "all",
        category: "blacklist"
      };

      pool.query.mockResolvedValueOnce([[mockSubject]]);
      pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

      await securityService.revokeAuthority(mockId, { target: "all" });

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining("SET active = ?"),
        expect.arrayContaining([0])
      );
    });

    it("should update block_target to 'ip' when unblocking MAC from 'all'", async () => {
      const mockId = 456;
      const mockSubject = {
        id: mockId,
        block_target: "all",
        category: "blacklist"
      };

      pool.query
        .mockResolvedValueOnce([[mockSubject]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      await securityService.revokeAuthority(mockId, { target: "mac" });

      expect(pool.query).toHaveBeenLastCalledWith(
        expect.stringMatching(/SET\s+active\s+=\s+\?,\s+block_target\s+=\s+\?/),
        expect.arrayContaining([1, "ip", expect.any(Number), null, "", 456])
      );
    });
  });

  describe("banDevice", () => {
    it("should insert a unified record with both IP and MAC", async () => {
      const mockReq = {
        headers: { 
          "x-forwarded-for": "1.2.3.4",
          "x-client-mac": "AA:BB:CC:DD:EE:FF"
        }
      };

      pool.query.mockResolvedValueOnce([{ insertId: 1 }]);

      await securityService.banDevice(mockReq);

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO security_authority"),
        expect.arrayContaining(["1.2.3.4", "AABBCCDDEEFF"])
      );
    });
  });
});
