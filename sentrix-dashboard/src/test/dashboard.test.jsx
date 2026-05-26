import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MetricPill } from '../components/MetricPill.jsx';
import { fetchJson } from '../services/api.js';

// Mock global fetch
global.fetch = vi.fn();

// Dummy icon component
const DummyIcon = (props) => <svg data-testid="dummy-icon" {...props} />;

describe('Dashboard Tests', () => {
  describe('MetricPill Component', () => {
    it('should render label and value correctly', () => {
      render(<MetricPill icon={DummyIcon} label="CPU" value="25%" />);
      expect(screen.getByText('CPU')).toBeInTheDocument();
      expect(screen.getByText('25%')).toBeInTheDocument();
    });

    it('should render the icon', () => {
      render(<MetricPill icon={DummyIcon} label="RAM" value="8GB" />);
      expect(screen.getByTestId('dummy-icon')).toBeInTheDocument();
    });
  });

  describe('API Service (fetchJson)', () => {
    it('should fetch data successfully', async () => {
      const mockData = { success: true, data: { foo: 'bar' } };
      fetch.mockResolvedValue({
        ok: true,
        json: async () => mockData,
      });

      const result = await fetchJson('/test');
      expect(result).toEqual(mockData);
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/test'), expect.any(Object));
    });

    it('should throw error on failure', async () => {
      fetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ success: false, message: 'Server error' }),
      });

      await expect(fetchJson('/test')).rejects.toThrow('Server error');
    });
  });
});
