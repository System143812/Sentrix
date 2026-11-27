import { describe, it, expect, vi, beforeEach } from "vitest";
import pool from "../../src/lib/database.js";
import { ClientRepository } from "../../src/modules/clients/clients.repository.js";

vi.mock("../../src/lib/database.js", () => ({
  default: {
    query: vi.fn(),
  },
}));

describe("Orphaned Pending Clients Cleanup - Multi-Condition Safety Net", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should enforce multi-condition SQL safety net covering token expiration and absolute age threshold", async () => {
    const now = 1795476000000;
    pool.query.mockResolvedValue([{ affectedRows: 4 }]);

    const deletedCount = await ClientRepository.deleteStalePendingClients(now);

    expect(deletedCount).toBe(4);
    expect(pool.query).toHaveBeenCalledTimes(1);

    const [sql, params] = pool.query.mock.calls[0];

    // Safety Condition: Must protect fully registered clients
    expect(sql).toContain("hardware_fingerprint IS NULL");

    // Multi-condition cleanup logic: Token expiry OR absolute creation age threshold
    expect(sql).toContain("token_expires_at < ?");
    expect(sql).toContain("created_at < ?");
    expect(params.length).toBe(2);
    expect(params[0]).toBe(now);
    expect(typeof params[1]).toBe("number"); // maxAgeThreshold
  });

  it("should return 0 affected rows and handle database errors gracefully", async () => {
    const now = 1795476000000;
    pool.query.mockRejectedValue(new Error("Database timeout"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const deletedCount = await ClientRepository.deleteStalePendingClients(now);

    expect(deletedCount).toBe(0);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
