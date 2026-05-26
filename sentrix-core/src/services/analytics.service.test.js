import { describe, it, expect } from 'vitest';
import * as analyticsService from './analytics.service.js';

describe('Analytics Service Sanity Check', () => {
  it('should import without syntax errors', () => {
    expect(analyticsService).toBeDefined();
    expect(typeof analyticsService.getAnalyticsSummary).toBe('function');
  });
});
