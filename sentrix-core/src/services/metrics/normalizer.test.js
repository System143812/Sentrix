import { describe, it, expect } from "vitest";
import { normalizeMetrics } from "./normalizer.js";

describe("Metrics Normalizer", () => {
  it("should return null fallback for cpu, ram, and disk when they are missing", () => {
    const rawMetrics = {
      timestamp: Date.now(),
    };

    const normalized = normalizeMetrics(rawMetrics);

    expect(normalized.cpu).toBeNull();
    expect(normalized.ram).toBeNull();
    expect(normalized.disk).toBeNull();
  });

  it("should correctly parse and round numeric values when present", () => {
    const rawMetrics = {
      timestamp: Date.now(),
      system: {
        cpu: { usage: 25.4 },
        memory: { usage: 60.7 },
        disk: { usage: 45.2 },
        uptimeSeconds: 3600
      }
    };

    const normalized = normalizeMetrics(rawMetrics);

    expect(normalized.cpu).toBe(25.4);
    expect(normalized.ram).toBe(60.7);
    expect(normalized.disk).toBe(45.2);
    expect(normalized.uptime).toBe(3600);
  });
});
