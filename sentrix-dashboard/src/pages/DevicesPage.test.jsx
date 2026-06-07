import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DevicesPage } from './DevicesPage';
import { ToastProvider } from '../components/ToastProvider';

// Mock complex components
vi.mock('../components/PageHeader', () => ({
  PageHeader: ({ title }) => <h1>{title}</h1>
}));

vi.mock('../components/DeviceTable', () => ({
  DeviceTable: ({ devices }) => (
    <div data-testid="device-table">
      {devices.map(d => <div key={d.id}>{d.hostname}</div>)}
    </div>
  )
}));

const mockDashboardData = {
  clients: [
    { id: '1', hostname: 'PC-1', group: 'Lab A', status: 'online' },
    { id: '2', hostname: 'PC-2', group: 'Lab B', status: 'offline' }
  ]
};

describe('DevicesPage', () => {
  it('renders all devices by default', () => {
    render(
      <ToastProvider>
        <DevicesPage dashboardData={mockDashboardData} />
      </ToastProvider>
    );
    
    expect(screen.getByText('PC-1')).toBeInTheDocument();
    expect(screen.getByText('PC-2')).toBeInTheDocument();
  });

  it('filters devices by search query', () => {
    render(
      <ToastProvider>
        <DevicesPage dashboardData={mockDashboardData} />
      </ToastProvider>
    );
    
    const searchInput = screen.getByPlaceholderText(/Search devices/);
    fireEvent.change(searchInput, { target: { value: 'PC-1' } });
    
    expect(screen.getByText('PC-1')).toBeInTheDocument();
    expect(screen.queryByText('PC-2')).not.toBeInTheDocument();
  });

  it('filters devices by group', () => {
    render(
      <ToastProvider>
        <DevicesPage dashboardData={mockDashboardData} />
      </ToastProvider>
    );
    
    // The group filter is a select/dropdown in SearchFilterBar
    // Based on the code: options: groupOptions.map(...)
    const groupSelect = screen.getByRole('combobox');
    fireEvent.change(groupSelect, { target: { value: 'Lab A' } });
    
    expect(screen.getByText('PC-1')).toBeInTheDocument();
    expect(screen.queryByText('PC-2')).not.toBeInTheDocument();
  });
});
