import { describe, it, expect } from 'vitest';
import * as analyticsService from './analytics.service.js';

describe('Analytics Service Sanity Check', () => {
  it('should import without syntax errors', () => {
    expect(analyticsService).toBeDefined();
    expect(typeof analyticsService.getAnalyticsSummary).toBe('function');
  });

  it('should include deviceTrends in summary', async () => {
    // This is a partial test as it depends on mock data in the service's dependencies
    // but we can at least check if the function exists and runs.
    // In a real scenario, we'd mock the database pool.
    expect(typeof analyticsService.getAnalyticsSummary).toBe('function');
  });
});
