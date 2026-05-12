# Sentrix

A real-time network and screen monitoring system for computer labs.

## MVP Architecture

Sentrix is split into three apps:

- `sentrix-core` - Express and Socket.IO backend.
- `sentrix-agent` - Electron device agent that reports machine metrics.
- `sentrix-dashboard` - React, Vite, and Tailwind dashboard for monitoring labs.
- MySQL stores users, groups, registered clients, latest metrics, and metrics history.

## Realtime Event Flow

1. The agent connects to the backend with Socket.IO.
2. The agent emits `agent:register` with hostname, OS, IP, and MAC.
3. The agent emits `agent:metrics` every few seconds with CPU, RAM, disk, and uptime.
4. The backend upserts the client record in MySQL and appends sampled metrics history.
5. The dashboard loads `/api/clients` and receives realtime `devices:update` events through Socket.IO.

## Data Sources

Sentrix no longer relies on static dashboard device data. Current device data comes from:

- live Sentrix agents using `systeminformation` and Node `os` APIs
- persisted MySQL client records and metrics history
- LAN discovery scans that combine ARP, optional Nmap results, DNS/NetBIOS lookups, open ports, and vendor hints

Discovery scan snapshots are currently kept in backend memory for realtime dashboard updates. Registered agent clients and their metrics are persisted in MySQL, but the latest discovery-only device list is rebuilt after scans and does not survive a backend restart unless those devices also have registered agents.

Some analytics values are fully real because they come from agent metrics, such as CPU, RAM, disk, uptime, device identity, hardware details, and heartbeat status. Temperature, latency, packet loss, and network throughput should be treated as estimated/derived values until the agent reports those measurements directly.

## Setup

Run each app in its own terminal.

```bash
cd sentrix-core
npm install
npm run dev
```

```bash
cd sentrix-agent
npm install
npm run dev //this is for headless agent
npm run dev:electron //to run the electron app (agent)
```

```bash
cd sentrix-dashboard
npm install
npm run dev
```

Default URLs:

- Backend: `http://localhost:4000`
- Dashboard: `http://localhost:5173`

Before running the backend, create the MySQL database and apply `sentrix-core/schema.sql`. Configure database access with `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, and `DB_DATABASE` if your local settings are different from the defaults in `sentrix-core/src/lib/database.js`.

## Current MVP Features

- Realtime device registration
- Online/offline heartbeat tracking
- CPU, RAM, disk, uptime, hostname, OS, IP, and MAC reporting
- MySQL-backed client, user, group, and metrics history storage
- Dashboard search and status filters
- Basic group assignment
- Realtime LAN discovery stream with manual rescan at `GET /api/discovery/scan`
- Analytics dashboard and CSV export based on stored client metrics

## Roles

Sentrix currently uses two admin roles:

- `network_admin` - can create/remove normal admin accounts and create, rename, or delete groups.
- `admin` - can monitor devices and use existing groups, but cannot manage admin accounts or group definitions.

The first account should be created as the network admin. Normal admin accounts are created from the dashboard settings page by a network admin.

## Discovery and Deployment

Network scanning now runs in the background and streams status/results through Socket.IO. The dashboard Rescan button manually triggers a fresh scan.

Hostname and type detection uses the best local signals available:

- registered Sentrix agent identity
- optional `nmap -sn` results when Nmap is installed
- reverse DNS
- Windows `ping -a`
- NetBIOS
- nslookup
- common open ports
- basic vendor hints when available

Some devices may still show as `Unknown` when the network blocks name resolution, hides ports, or uses randomized MAC addresses. The Sentrix agent remains the trusted identity source after installation.

Agent deployment is only enabled for devices found in the latest scan and classified as `PC`. Mobile devices, printers, and unknown device types are not deploy eligible.

The current deployment endpoint prepares the target installer command and server URL. It does not yet perform fully automated remote installation; remote deployment still needs credentials/transport work such as WinRM, SSH, domain tooling, or another approved deployment channel.

## Remaining Real-Data Work

- Persist discovery-only scan results if the network page must keep scanned devices after backend restarts.
- Extend the agent to report real temperature, network throughput, latency, and packet-loss metrics if those analytics must be production-grade.
- Implement an authenticated remote deployment service if admins should push the agent directly from the dashboard.

## Team Collaboration

Sentrix includes beginner-friendly collaboration docs:

- `CONTRIBUTING.md`
- `docs/TEAM_WORKFLOW.md`

Use these when splitting work across teammates.
