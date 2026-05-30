import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import React from 'react';

// Import components to check
import { DeviceTable } from '../components/DeviceTable.jsx';
import { DevicesPage } from '../pages/DevicesPage.jsx';
import { AnalyticsPage } from '../pages/AnalyticsPage.jsx';
import { AuditPage } from '../pages/AuditPage.jsx';
import { NetworkPage } from '../pages/NetworkPage.jsx';
import { ToastProvider } from '../components/ToastProvider.jsx';

// Mocking dependencies
vi.mock('../services/auditApi.js', () => ({
  getAuditLogs: vi.fn(() => Promise.resolve([])),
  blockAuditLogSubject: vi.fn(() => Promise.resolve({})),
}));

vi.mock('../services/clientApi.js', () => ({
  getClientHardware: vi.fn(() => Promise.resolve({})),
  getClientMetrics: vi.fn(() => Promise.resolve({ history: [], latest: null })),
  getClientPeripheralHistory: vi.fn(() => Promise.resolve({ inventory: [], events: [] })),
  getClientPeripheralHistoryFiltered: vi.fn(() => Promise.resolve({ inventory: [], events: [] })),
  getClientProcesses: vi.fn(() => Promise.resolve([])),
  getClientNetworkActivity: vi.fn(() => Promise.resolve({ connections: [], dnsLogs: [] })),
  getClientActivityHistory: vi.fn(() => Promise.resolve([])),
  getClientEvents: vi.fn(() => Promise.resolve([])),
  getClientDomains: vi.fn(() => Promise.resolve([])),
  getClientSoftware: vi.fn(() => Promise.resolve({ inventory: [], events: [] })),
  getClientHealth: vi.fn(() => Promise.resolve({ snapshots: [], uptimeLogs: [] })),
  getClientAnomalies: vi.fn(() => Promise.resolve([])),
  killClientProcess: vi.fn(() => Promise.resolve({ success: true })),
  sendDeviceCommand: vi.fn(() => Promise.resolve({ success: true })),
  updatePeripheralStatus: vi.fn(() => Promise.resolve({})),
}));

vi.mock('../services/settingsApi.js', () => ({
  getTelemetrySettings: vi.fn(() => Promise.resolve({ intervalMs: 5000 })),
  updateTelemetrySettings: vi.fn(() => Promise.resolve({ intervalMs: 5000 })),
  getUtilityConfig: vi.fn(() => Promise.resolve({ enabledIds: [] })),
}));

vi.mock('../services/analyticsApi.js', () => ({
  getAnalytics: vi.fn(() => Promise.resolve({
    totals: { total: 0 },
    averages: { health: 100 },
    alerts: { active: [] },
    devices: { rows: [] },
    trends: { cpu: [] },
    peripherals: { groups: [] }
  })),
}));

// Mock usePaginationState to avoid localStorage issues in tests
vi.mock('../hooks/usePaginationState.js', () => ({
  usePaginationState: vi.fn(() => ({
    currentPage: 1,
    pageSize: 5,
    setCurrentPage: vi.fn(),
    setPageSize: vi.fn(),
  })),
}));

const mockDashboardData = {
  clients: [
    { id: 1, hostname: 'SENTRIX-PC-01', ip: '192.168.1.10', mac: 'AA:BB:CC', status: 'online', metrics: {} }
  ]
};

const Wrapped = ({ children }) => (
  <ToastProvider>{children}</ToastProvider>
);

describe('Runtime Rendering Checks (Smoke Tests)', () => {
  it('DeviceTable should render without crashing', () => {
    const { unmount } = render(
      <Wrapped>
        <DeviceTable 
          devices={mockDashboardData.clients} 
          currentPage={1} 
          pageSize={5} 
          totalItems={1}
        />
      </Wrapped>
    );
    unmount();
  });

  it('AnalyticsPage should render without crashing', () => {
    const { unmount } = render(
      <Wrapped>
        <AnalyticsPage dashboardData={mockDashboardData} loading={false} />
      </Wrapped>
    );
    unmount();
  });

  it('DevicesPage should render without crashing', () => {
    const { unmount } = render(
      <Wrapped>
        <DevicesPage dashboardData={mockDashboardData} loading={false} groups={[]} />
      </Wrapped>
    );
    unmount();
  });

  it('AuditPage should render without crashing', () => {
    const { unmount } = render(
      <Wrapped>
        <AuditPage />
      </Wrapped>
    );
    unmount();
  });

  it('NetworkPage should render without crashing', () => {
    const { unmount } = render(
      <Wrapped>
        <NetworkPage snapshot={{ devices: [] }} />
      </Wrapped>
    );
    unmount();
  });

  it('DeviceTable should render expanded details without crashing', async () => {
    const { container, unmount } = render(
      <Wrapped>
        <DeviceTable 
          devices={mockDashboardData.clients} 
          currentPage={1} 
          pageSize={5} 
          totalItems={1}
        />
      </Wrapped>
    );
    
    // Simulate clicking the expand button
    const expandButton = container.querySelector('button[title="Expand details"]');
    if (expandButton) {
      fireEvent.click(expandButton);
    }
    
    unmount();
  });
});
