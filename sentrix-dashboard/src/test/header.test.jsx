import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { DashboardShell } from '../app/App.jsx';
import { ToastProvider } from '../components/ToastProvider.jsx';

// Mock dependencies
vi.mock('../hooks/useDevices.js', () => ({
  useDevices: vi.fn(() => ({
    dashboardData: { clients: [] },
    connected: true,
    loading: false,
    updateGroup: vi.fn(),
    refresh: vi.fn(),
    archiveDevice: vi.fn(),
  })),
}));

vi.mock('../hooks/useDiscovery.js', () => ({
  useDiscovery: vi.fn(() => ({})),
}));

vi.mock('../services/authApi.js', () => ({
  getCurrentUser: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  clearSavedLogin: vi.fn(),
}));

vi.mock('../services/groupApi.js', () => ({
  getGroups: vi.fn(),
}));

// Mock child components that might be complex
vi.mock('../pages/HomePage.jsx', () => ({ HomePage: () => <div data-testid="home-page">Home</div> }));
vi.mock('../pages/DevicesPage.jsx', () => ({ DevicesPage: () => <div data-testid="devices-page">Devices</div> }));
vi.mock('../pages/NetworkPage.jsx', () => ({ NetworkPage: () => <div data-testid="network-page">Network</div> }));
vi.mock('../pages/AnalyticsPage.jsx', () => ({ AnalyticsPage: () => <div data-testid="analytics-page">Analytics</div> }));
vi.mock('../pages/AuditPage.jsx', () => ({ AuditPage: () => <div data-testid="audit-page">Audit</div> }));
vi.mock('../pages/SettingsPage.jsx', () => ({ SettingsPage: () => <div data-testid="settings-page">Settings</div> }));

const mockUser = {
  email: 'admin@sentrix.local',
  role: 'network_admin'
};

const WrappedDashboard = (props) => (
  <ToastProvider>
    <DashboardShell 
      user={mockUser} 
      activeTab="home" 
      setActiveTab={vi.fn()} 
      groups={[]} 
      onGroupsChanged={vi.fn()} 
      onLogout={vi.fn()} 
      {...props} 
    />
  </ToastProvider>
);

describe('Header Verification', () => {
  it('should render the brand logo', () => {
    render(<WrappedDashboard />);
    // There are now two logos (mobile/desktop)
    const logos = screen.getAllByRole('img', { name: /Sentrix shield logo/i });
    expect(logos.length).toBeGreaterThan(0);
    expect(logos[0].closest('div')).toHaveTextContent(/Sentrix/i);
  });

  it('should render the navigation tabs', () => {
    render(<WrappedDashboard />);
    // There are two navigation elements
    const navs = screen.getAllByRole('navigation');
    expect(navs.length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /Home/i }).length).toBeGreaterThan(0);
  });

  it('should render the user dropdown with role', () => {
    render(<WrappedDashboard />);
    // Two dropdown buttons
    const roles = screen.getAllByText(/Network Admin/i);
    expect(roles.length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Authenticated as/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(mockUser.email).length).toBeGreaterThan(0);
  });

  it('should show connected status when connected', () => {
    render(<WrappedDashboard />);
    const status = screen.getAllByText(/Connected/i);
    expect(status.length).toBeGreaterThan(0);
  });
});
