# Sentrix

A real-time network and screen monitoring system for computer labs.

## MVP Architecture

Sentrix is split into three apps:

- `sentrix-core` - Express and Socket.IO backend.
- `sentrix-agent` - Electron device agent that reports machine metrics.
- `sentrix-dashboard` - React, Vite, and Tailwind dashboard for monitoring labs.

## Realtime Event Flow

1. The agent connects to the backend with Socket.IO.
2. The agent emits `agent:register` with hostname, OS, IP, and MAC.
3. The agent emits `agent:metrics` every few seconds with CPU, RAM, disk, and uptime.
4. The backend keeps devices in an in-memory `Map`.
5. The dashboard connects as a Socket.IO dashboard client and receives `devices:snapshot`.

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

## Current MVP Features

- Realtime device registration
- Online/offline heartbeat tracking
- CPU, RAM, disk, uptime, hostname, OS, IP, and MAC reporting
- Dashboard search and status filters
- Basic group assignment
- Realtime LAN discovery stream with manual rescan at `GET /api/discovery/scan`

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

## Team Collaboration

Sentrix includes beginner-friendly collaboration docs:

- `CONTRIBUTING.md`
- `docs/TEAM_WORKFLOW.md`

Use these when splitting work across teammates.
