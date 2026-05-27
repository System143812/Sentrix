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

This guide provides a step-by-step procedure for setting up the Sentrix environment from scratch on a Windows machine.

### Prerequisites
Before starting, download and install the following tools:
1.  **Node.js (v20.x or higher):** [Download from nodejs.org](https://nodejs.org/en/download/). Choose the "LTS" version.
2.  **MySQL Community Server (v8.0 or higher):** [Download from dev.mysql.com](https://dev.mysql.com/downloads/installer/). During installation, remember your root password.
3.  **Git for Windows:** [Download from git-scm.com](https://git-scm.com/download/win).
4.  **Nmap (Optional but Recommended):** [Download from nmap.org](https://nmap.org/download.html). Install the self-installer (e.g., `nmap-7.95-setup.exe`).

### Step 1: Clone the Project
Open a terminal (PowerShell or Git Bash) and run:
```bash
git clone https://github.com/your-repo/sentrix.git
cd sentrix
```

### Step 2: Database Setup
1.  Open the **MySQL Command Line Client** or a tool like **MySQL Workbench**.
2.  Log in with your root password.
3.  Create the database:
    ```sql
    CREATE DATABASE sentrix;
    ```
4.  Import the schema:
    *   In the terminal, navigate to the `sentrix-core` folder.
    *   Run: `mysql -u your_username -p sentrix < schema.sql` (Replace `your_username` with your MySQL username).
    *   *Alternatively:* Open `sentrix-core/schema.sql` in MySQL Workbench and execute the entire script.

### Step 3: Backend Configuration (Core)
1.  Navigate to the core directory:
    ```bash
    cd sentrix-core
    npm install
    ```
2.  Create a file named `.env` in the `sentrix-core` folder and add the following content:
    ```env
    PORT=3000
    DB_HOST=localhost
    DB_USER=your_mysql_username
    DB_PASS=your_mysql_password
    DB_NAME=sentrix
    JWT_SECRET=choose_a_random_long_string
    ```
3.  Start the backend in development mode:
    ```bash
    npm run dev
    ```

### Step 4: Frontend Configuration (Dashboard)
1.  Open a **new terminal window** and navigate to the dashboard directory:
    ```bash
    cd sentrix-dashboard
    npm install
    ```
2.  Start the dashboard development server:
    ```bash
    npm run dev
    ```
3.  Open your browser and navigate to `http://localhost:5173`.

### Step 5: Preparing Client PCs for Remote Deployment
To enable "Zero-Touch" deployment to laboratory workstations, you must prepare each target PC once:
1.  Ensure the client PC is on the same network as the Core.
2.  Locate `scripts/Sentrix-PC-Provisioner.ps1` in the project root.
3.  Copy this script to the client PC.
4.  Right-click the script and select **Run with PowerShell** as Administrator (or run `.\Sentrix-PC-Provisioner.ps1` from an elevated PowerShell window).
    *   This script enables the built-in Administrator account and configures firewall rules for SMB and WMI.

### Step 6: Deploying the Agent
1.  Log in to the Sentrix Dashboard.
2.  Navigate to the **Network** or **Discovery** page.
3.  Click **Rescan** to find the prepared client PC.
4.  Click **Deploy** on the discovered device.
5.  Enter `Administrator` as the username and the password set during provisioning.
6.  The system will push the agent, and once complete, the device will start reporting live telemetry to the **Devices** and **Analytics** pages.

---

## Technical Maintenance
*   **Database Migrations:** If you update the project, check `sentrix-core/src/database/migrations` for new SQL files and run them in order.
*   **Agent Updates:** Re-deploying from the dashboard will overwrite the existing agent with the latest version.
*   **Testing:** Run `npm test` in the `sentrix-core` or `sentrix-dashboard` directories to execute the automated test suites.
