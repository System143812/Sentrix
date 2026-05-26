# Sentrix

Sentrix is a professional-grade, real-time network monitoring and remote management system (RMM) specifically engineered for Windows computer laboratories. It provides a centralized dashboard for administrators to discover network devices, deploy monitoring agents remotely, and oversee fleet health with high-granularity hardware metrics.

---

## System Architecture

Sentrix operates as a distributed system comprising three primary modules:

### 1. Sentrix Core (Backend)
The central management hub responsible for orchestration.
*   **Role:** Handles database persistence, business logic, network discovery scans, and the remote deployment engine.
*   **Technology:** Node.js, Express, Socket.io, MySQL.
*   **Communication:** Serves a REST API for the dashboard and maintains persistent WebSocket connections with agents via Socket.io.

### 2. Sentrix Agent (Client)
A lightweight background process installed on each laboratory workstation.
*   **Role:** Executes as a SYSTEM service to collect real-time hardware telemetry and receive remote management commands.
*   **Technology:** Node.js, Electron (for optional UI), systeminformation.
*   **Communication:** Initiates outbound "reverse-tunnel" connections to the Core to bypass client-side firewalls.

### 3. Sentrix Dashboard (Frontend)
The administrative user interface.
*   **Role:** Provides a real-time visual overview of the laboratory, analytics, and management tools.
*   **Technology:** React, Vite, Tailwind CSS, Lucide React.
*   **Communication:** Consumes RESTful endpoints and listens for real-time telemetry updates via Socket.io.

---

## Data Flow and Technology Stack

### Network Discovery
*   **Flow:** Core -> Network Interface -> ARP/NetBIOS/Nmap -> Database.
*   **Tools:** Nmap (optional), Node-arp.
*   **Purpose:** Identifies active devices on the local subnet to prepare for agent deployment.

### Dual-Transport Deployment Engine
*   **Flow:** Dashboard -> Core -> SMB/WMI Handshake -> Agent Binary Transfer -> Execution.
*   **Protocol:** SMB (Server Message Block) and WMI (Windows Management Instrumentation).
*   **Purpose:** Allows "Zero-Touch" installation. Core pushes the agent to the client's administrative share and triggers the installer remotely.

### Real-Time Telemetry
*   **Flow:** Agent -> Socket.io -> Core -> Dashboard.
*   **Metrics:** CPU (usage/temp), RAM (usage), Disk (usage/health), Network (throughput/latency), Peripherals.
*   **Purpose:** Provides instant visibility into workstation performance and hardware failures.

### Persistence Layer
*   **Database:** MySQL.
*   **Purpose:** Stores device metadata, historical performance trends, audit logs, and user credentials.

---

## Core Features

### Laboratory Discovery
*   Comprehensive subnet scanning to identify managed and unmanaged devices.
*   Automated identification of hostnames, IP addresses, and MAC addresses.

### Zero-Touch Deployment
*   Remote installation of agents via Administrative Shares (SMB).
*   High-privilege execution using WMI without requiring physical access to the workstation.

### Fleet Monitoring
*   Live hardware telemetry (CPU, GPU, RAM, Disk, Temperature).
*   Connection status tracking (Online/Offline) with automated heartbeat monitoring.
*   Peripheral tracking to identify missing or disconnected hardware (Keyboards, Mice, etc.).

### Remote Management
*   Instant power commands: Shutdown, Restart, and Sleep.
*   Group-based management for organized laboratory oversight.

### Analytics and Reporting
*   Historical performance trending for health scores and resource utilization.
*   Exportable reports in CSV, PDF, and DOCX formats for administrative review.

### Security
*   Role-Based Access Control (RBAC) for Network Admins and Staff.
*   Encrypted Socket.io communication.
*   Agent execution as a protected SYSTEM service.

---

## Setup and Installation Guide

This guide provides a step-by-step procedure for setting up the Sentrix environment on a Windows machine.

### Prerequisites
1.  **Node.js:** Download and install Node.js (v20 or higher) from [nodejs.org](https://nodejs.org/).
2.  **MySQL Server:** Download and install MySQL Community Server (v8.0 or higher) from [dev.mysql.com](https://dev.mysql.com/downloads/mysql/).
3.  **Git:** Download and install Git from [git-scm.com](https://git-scm.com/).

### Step 1: Clone the Repository
Open a terminal (PowerShell or Command Prompt) and run:
```bash
git clone https://github.com/your-repo/sentrix.git
cd sentrix
```

### Step 2: Database Configuration
1.  Open your MySQL terminal or a GUI tool like MySQL Workbench.
2.  Create a new database named `sentrix`:
    ```sql
    CREATE DATABASE sentrix;
    ```
3.  Navigate to `sentrix-core/src/database/migrations` and execute the SQL scripts in numerical order (001 to 015) against the `sentrix` database.

### Step 3: Backend Configuration (Core)
1.  Navigate to the core directory:
    ```bash
    cd sentrix-core
    npm install
    ```
2.  Create a `.env` file in the `sentrix-core` folder:
    ```env
    PORT=3000
    DB_HOST=localhost
    DB_USER=your_mysql_user
    DB_PASS=your_mysql_password
    DB_NAME=sentrix
    JWT_SECRET=your_random_secret_string
    ```
3.  Start the backend:
    ```bash
    npm run dev
    ```

### Step 4: Frontend Configuration (Dashboard)
1.  Open a new terminal window and navigate to the dashboard directory:
    ```bash
    cd sentrix-dashboard
    npm install
    ```
2.  Start the dashboard:
    ```bash
    npm run dev
    ```
3.  The dashboard should now be accessible at `http://localhost:5173`.

### Step 5: Preparing Client PCs for Deployment
To allow the Core to push the agent to other PCs, each client machine must be prepared once:
1.  Navigate to the `scripts/` folder in the project root.
2.  Copy `Sentrix-PC-Provisioner.ps1` to the client PC.
3.  Run the script as Administrator in PowerShell:
    ```powershell
    .\Sentrix-PC-Provisioner.ps1
    ```
    *This script enables the built-in Administrator account and opens the required firewall ports for SMB and WMI.*

### Step 6: Deploying Agents
1.  Log in to the Sentrix Dashboard.
2.  Go to the **Discovery** page and click **Rescan**.
3.  Locate a discovered PC and click **Deploy**.
4.  Enter the client's `Administrator` credentials.
5.  Once the status changes to "Success," the device will appear in the **Devices** list with live metrics.

---

## Technical Maintenance
*   **Logs:** Core logs are available in the terminal output.
*   **Migrations:** When updating the system, check for new SQL files in `sentrix-core/src/database/migrations`.
*   **Testing:** Run `npm test` in any module directory to execute the Vitest suite.
