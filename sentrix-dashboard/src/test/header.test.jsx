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
    // Look for the logo specifically in the shrink-0 div
    const logoContainer = screen.getByRole('img', { name: /Sentrix shield logo/i }).closest('div');
    expect(logoContainer).toHaveTextContent(/Sentrix/i);
  });

  it('should render the navigation tabs', () => {
    render(<WrappedDashboard />);
    // Tabs like Home, Network, etc. are in the nav element
    const nav = screen.getByRole('navigation');
    expect(screen.getByRole('button', { name: /Home/i })).toBeInTheDocument();
    // Use getAllByRole or be more specific for Network to avoid the "Network Admin" button
    const networkTab = screen.getAllByRole('button', { name: /Network/i }).find(btn => btn.closest('nav'));
    expect(networkTab).toBeInTheDocument();
  });

  it('should render the user dropdown with role', () => {
    render(<WrappedDashboard />);
    // The user button is outside the nav
    expect(screen.getByText(/Network Admin/i)).toBeInTheDocument();
    expect(screen.getByText(/Authenticated as/i)).toBeInTheDocument();
    expect(screen.getByText(mockUser.email)).toBeInTheDocument();
  });

  it('should show live status when connected', () => {
    render(<WrappedDashboard />);
    expect(screen.getByText(/Live/i)).toBeInTheDocument();
  });
});
