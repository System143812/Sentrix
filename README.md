# Sentrix

A real-time network monitoring and remote management system designed for computer laboratories. Sentrix allows administrators to discover, deploy, and monitor an entire fleet of Windows machines from a single centralized dashboard.

## 🚀 Key Innovation: Zero-Touch Deployment
Sentrix features an innovative **Dual-Transport Push Engine** that overcomes the default security barriers of standalone Windows environments (Workgroups). 

- **Surgical Push:** Utilizing a one-time "Provisioning Handshake," Sentrix unlocks the built-in Administrator account and fixes Remote UAC filters.
- **Admin Push (SMB/WMI):** Remotely pushes the agent binary via Administrative Shares and triggers high-privileged execution without any physical interaction with the client PC.
- **Reverse-Tunnel Monitoring:** Once installed, the agent initiates an outbound Socket.io connection, allowing 100% remote control (restarts, monitoring) even behind firewalls and closed ports.

---

## 🏗️ System Architecture

Sentrix is composed of three integrated applications:

- **`sentrix-core`**: The Node.js (Express & Socket.IO) backbone. Manages the database, network discovery, and remote deployment logic.
- **`sentrix-agent`**: A lightweight Electron/Node.js background process. Runs as a **SYSTEM** service on client PCs to report metrics and execute remote commands.
- **`sentrix-dashboard`**: A modern React (Vite & Tailwind CSS) interface for real-time laboratory oversight.
- **MySQL**: The persistence layer for device identities, historical metrics, and user management.

---

## 🛠️ Setup & Installation

### 1. Backend (Core)
```bash
cd sentrix-core
npm install
# Configure your .env (DB_HOST, DB_USER, DB_PASS, etc.)
npm run dev
```
*Note: Ensure the database is initialized using `sentrix-core/src/database/migrations/001_initial_schema.sql`.*

### 2. Dashboard
```bash
cd sentrix-dashboard
npm install
npm run dev
```

### 3. Agent Deployment (The Laboratory)

To deploy to your lab, follow the **"Prep Once, Deploy Anywhere"** workflow:

#### Step A: The Handshake (One-Time)
Run the provisioner script as Administrator on your **Master Image** or each PC once:
```powershell
# Located in the scripts/ folder
.\Sentrix-PC-Provisioner.ps1
```
This script "unlocks" the PC by enabling the built-in Administrator and opening the required WMI/SMB ports.

#### Step B: The Push
1. Open the Sentrix Dashboard -> **Network Discovery**.
2. Click **Rescan** to find your lab PCs.
3. Click **Deploy** on a discovered PC.
4. Enter the `Administrator` credentials.
5. **Success:** The agent is pushed, installed, and starts reporting automatically.

---

## 📊 Real-Time Features

- **Laboratory Discovery:** Deep-scan subnets using Nmap, ARP, and NetBIOS to identify every device on your network.
- **High-Privilege Monitoring:** Agent runs as **SYSTEM**, making it resilient to user termination while providing deep hardware access (CPU, RAM, Disk, Temperature).
- **Remote Controls:** Restart, Shutdown, or Sleep machines directly from the dashboard.
- **Security Hardening (Coming Soon):** Automatic post-deployment lockdown that disables the Admin account and closes firewall ports after a successful install.
- **Analytics & Export:** View historical performance data and export metrics to CSV for laboratory reporting.

---

## 🔐 Security & Roles

Sentrix utilizes a strict role-based access control (RBAC) system:

- **`network_admin`**: Full control over laboratory configuration, user management, and group definitions.
- **`admin`**: Access to monitoring and remote control features for assigned groups.

**Security Note:** All remote management commands are sent via an authenticated Socket.io tunnel. The legacy ports (SMB/WMI) are only used during the initial 60-second deployment phase.

---

## 🤝 Team Collaboration

- `CONTRIBUTING.md`: Guidelines for adding new features.
- `docs/TEAM_WORKFLOW.md`: Documentation on splitting tasks and branch management.

---
*Built for modern laboratory management. Secure, Scalable, and Innovative.*
