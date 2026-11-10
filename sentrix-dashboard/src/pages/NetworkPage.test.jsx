import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NetworkPage } from "./NetworkPage";
import { ToastProvider } from "../components/ToastProvider";

// Mock components that might be complex or unnecessary for this unit test
vi.mock("../components/PageHeader", () => ({
  PageHeader: ({ children, title, action }) => (
    <div>
      <h1>{title}</h1>
      {action}
      {children}
    </div>
  ),
}));

const mockUser = { role: "network_admin" };
const mockSnapshot = {
  status: "idle",
  devices: [
    {
      ip: "192.168.1.10",
      hostname: "PC-1",
      deploy_eligible: true,
      agent_status: "none",
    },
  ],
  subnet: "192.168.1",
};

describe("NetworkPage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders scan results", () => {
    render(
      <ToastProvider>
        <NetworkPage user={mockUser} snapshot={mockSnapshot} />
      </ToastProvider>,
    );

    expect(screen.getByText("PC-1")).toBeInTheDocument();
    expect(screen.getByText("192.168.1.10")).toBeInTheDocument();
  });

  it("calls onScan when Rescan button is clicked", () => {
    const onScan = vi.fn();
    render(
      <ToastProvider>
        <NetworkPage user={mockUser} snapshot={mockSnapshot} onScan={onScan} />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByText("Rescan"));
    expect(onScan).toHaveBeenCalled();
  });

  it("calls onSetSubnet when the subnet selector changes", () => {
    const onSetSubnet = vi.fn();
    render(
      <ToastProvider>
        <NetworkPage
          user={mockUser}
          snapshot={mockSnapshot}
          interfaces={[
            { name: "Ethernet", address: "192.168.1.200", subnet: "192.168.1" },
            { name: "Lab", address: "192.168.2.200", subnet: "192.168.2" },
          ]}
          onSetSubnet={onSetSubnet}
        />
      </ToastProvider>,
    );

    fireEvent.change(screen.getByRole("combobox", { name: /target subnet/i }), {
      target: { value: "192.168.2" },
    });

    expect(onSetSubnet).toHaveBeenCalledWith("192.168.2");
  });

  it("opens deploy modal when Deploy button is clicked", () => {
    render(
      <ToastProvider>
        <NetworkPage user={mockUser} snapshot={mockSnapshot} />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /deploy/i }));
    expect(screen.getByText("Deploy Sentrix Agents")).toBeInTheDocument();
  });

  it("calls onDeploy when batch deployment is confirmed", async () => {
    const onDeploy = vi.fn().mockResolvedValue({ success: true });
    render(
      <ToastProvider>
        <NetworkPage
          user={mockUser}
          snapshot={mockSnapshot}
          onDeploy={onDeploy}
        />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /deploy/i }));
    fireEvent.click(screen.getByRole("button", { name: /Start Deploy/i }));

    expect(onDeploy).toHaveBeenCalledWith(
      "192.168.1.10",
      "PC",
      null,
      "deploy",
    );
  });

  it("shows view only for non-network admins", () => {
    render(
      <ToastProvider>
        <NetworkPage user={{ role: "admin" }} snapshot={mockSnapshot} />
      </ToastProvider>,
    );

    expect(screen.getByText("View Only Mode")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /deploy/i })).not.toBeInTheDocument();
  });
});
