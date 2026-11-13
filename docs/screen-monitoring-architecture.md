# Sentrix Screen Monitoring Feature — Architecture & Implementation Plan

## 1. Overview & Objectives
The Screen Monitoring feature enables authorized administrators (`admin` / `network_admin`) to view the live desktop screen of any registered Sentrix agent in real time from the dashboard. 

### Key Requirements:
- **On-Demand Streaming**: Frames are captured and streamed *only* when an administrator actively opens the monitor view for a specific agent. Unviewed agents consume 0 bandwidth and 0 CPU for streaming.
- **Low Bandwidth & CPU Footprint**: Compressed JPEG frames (approx. 60% quality, 720p scaled) transmitted as raw binary buffers over WebSockets at 1–5 configurable FPS. Designed to effortlessly scale across 50–100 managed PCs with up to ~10 concurrent admin viewers.
- **Security-First Architecture**: All requests and stream frames are transmitted over authenticated, persistent WebSocket channels (`WSS`) leveraging existing agent-to-core secure connections, entirely avoiding WebRTC DTLS/self-signed certificate handshake complications.
- **Audit Logging**: Every screen monitoring session start and stop is logged to the system audit trail for compliance.

---

## 2. System Architecture & Component Interaction

```
┌─────────────────────────┐          WebSocket WSS (Binary Buffers)          ┌──────────────────────────┐
│   Sentrix Dashboard     │ ───────────────────────────────────────────────> │       Sentrix Core       │
│  (ScreenMonitorModal)   │ <─────────────────────────────────────────────── │ (Socket.IO Room Relay)   │
└─────────────────────────┘                                                  └──────────────────────────┘
                                                                                          │
                                                                                          │ WebSocket Relay
                                                                                          ▼
                                                                             ┌──────────────────────────┐
                                                                             │      Sentrix Agent       │
                                                                             │ (screenshot-desktop +    │
                                                                             │     JPEG Compression)    │
                                                                             └──────────────────────────┘
```

### Component Breakdown:

1. **Sentrix Dashboard (`sentrix-dashboard`)**:
   - Adds a "View Screen" action button to agent cards / details list.
   - Opens `ScreenMonitorModal.jsx` containing an HTML5 `<canvas>` rendering incoming binary JPEG blobs via `URL.createObjectURL()`.
   - Emits `dashboard:screen:start` (with target `agentId`, FPS, and quality settings) and `dashboard:screen:stop`.

2. **Sentrix Core (`sentrix-core`)**:
   - Manages WebSocket signaling and in-memory room relay (`io.to(agentId)`).
   - Validates admin role permissions (`admin` / `network_admin`) and logs audit events (`screen_monitoring_initiated`).
   - Relays raw binary buffers instantly without disk/database I/O bloat.

3. **Sentrix Agent (`sentrix-agent`)**:
   - Listens for screen stream start/stop commands over its persistent WebSocket connection.
   - Spawns a lightweight screen capture interval using `screenshot-desktop`.
   - Compresses screenshots into JPEG buffers (~60% quality) and emits raw binary `agent:screen:frame` payloads back to Core.

---

## 3. Data Flow & Protocol

### Step-by-Step Flow:
1. **Initiation**: Admin clicks "View Screen" in the dashboard. Dashboard emits `dashboard:screen:start` to Core with `{ agentId, fps: 2, quality: 60 }`.
2. **Authorization & Relay**: Core checks if caller has `admin` / `network_admin` role, verifies agent is online, and emits command to start streaming to the target agent.
3. **Agent Capture Loop**: 
   - Agent receives command, starts a background timer (`setInterval`).
   - Every interval (e.g., every 500ms for 2 FPS):
     - Captures screen buffer (`screenshot()`).
     - Compresses to JPEG buffer.
     - Emits raw binary `agent:screen:frame` over the existing WebSocket connection.
4. **Dashboard Rendering**: Core receives binary buffer, relays to dashboard viewer room. Dashboard receives blob, creates object URL, and draws onto `<canvas>`.
5. **Termination**: Admin closes modal. Dashboard emits `dashboard:screen:stop`. Agent clears interval and stops capturing immediately.

---

## 4. Technical Stack & Libraries

### Target Dependencies:
- **Agent (`sentrix-agent`)**:
  - `screenshot-desktop`: Cross-platform (Windows, macOS, Linux) native screen capture library.
  - Built-in Node.js Buffer / image compression utilities.
- **Core (`sentrix-core`)**:
  - Socket.IO rooms and binary buffer forwarding.
  - Security validation (`security.service.js`).
- **Dashboard (`sentrix-dashboard`)**:
  - HTML5 Canvas API for high-performance frame rendering (`ctx.drawImage`).
  - Lucide icons for UI controls (Play, Pause, Snapshot, Fullscreen).

---

## 5. Security & Privacy Considerations

- **Authorization**: Only users with `admin` or `network_admin` roles can request screen streams.
- **Transport Security**: Relies on WSS (WebSocket Secure over TLS), avoiding self-signed certificate rejection issues inherent in WebRTC P2P DTLS handshakes.
- **Audit Trail**: Stored in `audit_logs` table (`screen_monitoring_started`, `screen_monitoring_stopped`).

---

## 6. Pros, Cons & Trade-offs

| Approach | Pros | Cons |
| :--- | :--- | :--- |
| **WebRTC P2P** | Direct media streaming | Fails behind restrictive firewalls/NATs; breaks on self-signed TLS certificates due to DTLS handshake validation. |
| **WebSocket Binary Frame Streaming (Chosen)** | Works seamlessly behind firewalls/proxies and self-signed certificates; reuses existing agent connection; zero DB overhead; on-demand execution. | Requires small RAM buffering in Core during active admin viewing sessions. |

---

## 7. Implementation Roadmap (Phases)
- **Phase 1**: Agent screen capture utility integration (`screenshot-desktop` + JPEG compression test).
- **Phase 2**: Core WebSocket signaling (`screen:start`, `screen:stop`, `screen:frame` binary relay & audit logging).
- **Phase 3**: Dashboard UI (`ScreenMonitorModal.jsx`, HTML5 canvas rendering, FPS controls).
- **Phase 4**: Security hardening & end-to-end testing.
