import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NetworkPage } from './NetworkPage';
import { ToastProvider } from '../components/ToastProvider';

// Mock components that might be complex or unnecessary for this unit test
vi.mock('../components/PageHeader', () => ({
  PageHeader: ({ children, title, action }) => (
    <div>
      <h1>{title}</h1>
      {action}
      {children}
    </div>
  )
}));

vi.mock('../components/DeployDialog', () => ({
  DeployDialog: ({ onConfirm, onCancel }) => (
    <div data-testid="deploy-dialog">
      <button onClick={() => onConfirm({ user: 'admin', pass: 'pass' })}>Confirm</button>
      <button onClick={onCancel}>Cancel</button>
    </div>
  )
}));

const mockUser = { role: 'network_admin' };
const mockSnapshot = {
  status: 'idle',
  devices: [
    { ip: '192.168.1.10', hostname: 'PC-1', deploy_eligible: true, agent_status: 'none' }
  ],
  subnet: '192.168.1'
};

describe('NetworkPage', () => {
  it('renders scan results', () => {
    render(
      <ToastProvider>
        <NetworkPage user={mockUser} snapshot={mockSnapshot} />
      </ToastProvider>
    );
    
    expect(screen.getByText('PC-1')).toBeInTheDocument();
    expect(screen.getByText('192.168.1.10')).toBeInTheDocument();
  });

  it('calls onScan when Rescan button is clicked', () => {
    const onScan = vi.fn();
    render(
      <ToastProvider>
        <NetworkPage user={mockUser} snapshot={mockSnapshot} onScan={onScan} />
      </ToastProvider>
    );
    
    fireEvent.click(screen.getByText('Rescan'));
    expect(onScan).toHaveBeenCalled();
  });

  it('opens deploy dialog when Deploy button is clicked', () => {
    render(
      <ToastProvider>
        <NetworkPage user={mockUser} snapshot={mockSnapshot} />
      </ToastProvider>
    );
    
    // Using regular expression to match button text because it might be "Deploy" or "Setup" etc.
    fireEvent.click(screen.getByRole('button', { name: /Deploy/i }));
    expect(screen.getByTestId('deploy-dialog')).toBeInTheDocument();
  });

  it('calls onDeploy when deployment is confirmed', async () => {
    const onDeploy = vi.fn().mockResolvedValue({ success: true });
    render(
      <ToastProvider>
        <NetworkPage user={mockUser} snapshot={mockSnapshot} onDeploy={onDeploy} />
      </ToastProvider>
    );
    
    fireEvent.click(screen.getByRole('button', { name: /Deploy/i }));
    fireEvent.click(screen.getByText('Confirm'));
    
    expect(onDeploy).toHaveBeenCalledWith('192.168.1.10', 'PC', expect.any(Object), 'deploy');
  });

  it('shows view only for non-network admins', () => {
    render(
      <ToastProvider>
        <NetworkPage user={{ role: 'admin' }} snapshot={mockSnapshot} />
      </ToastProvider>
    );
    
    expect(screen.getByText('View only')).toBeInTheDocument();
    expect(screen.queryByText('Deploy')).not.toBeInTheDocument();
  });
});
