import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AuditPage } from './AuditPage';

// Mock dependencies
vi.mock('../services/auditApi.js', () => ({
  getAuditLogs: vi.fn(() => Promise.resolve([])),
  getAuthorityRecords: vi.fn(() => Promise.resolve([])),
}));

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({
    on: vi.fn(),
    disconnect: vi.fn(),
  })),
}));

describe('AuditPage Responsiveness Fix', () => {
  const mockUser = { role: 'network_admin', email: 'admin@sentrix.local' };

  it('renders with overflow-x-auto container', () => {
    const { container } = render(
      <AuditPage user={mockUser} />
    );
    
    // Check for the overflow-x-auto class
    const scrollContainer = container.querySelector('.overflow-x-auto');
    expect(scrollContainer).toBeInTheDocument();
  });

  it('contains min-w-[1000px] on table headers and rows', async () => {
    render(
      <AuditPage user={mockUser} />
    );

    // Logs tab is default. Header should have min-w-[1000px]
    // The header is hidden on mobile but exists in the DOM
    const header = screen.getByText('Log Activity').parentElement;
    expect(header).toHaveClass('min-w-[1000px]');
  });
});
