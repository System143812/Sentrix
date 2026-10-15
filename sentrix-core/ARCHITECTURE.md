# Sentrix Core Architecture

Sentrix Core is being migrated toward a feature-based backend structure.

## Module Shape

Each feature module should own its HTTP boundary, business logic, and database access:

```txt
src/modules/<feature>/
  <feature>.route.js
  <feature>.controller.js
  <feature>.service.js
  <feature>.repository.js
```

Use this separation:

- Routes define endpoints and route-level middleware.
- Controllers translate requests into service calls and send responses.
- Services contain business rules and cross-module coordination.
- Repositories are the only module files allowed to import the database pool or call `pool.query`.

Database infrastructure and migrations are allowed to use the pool directly.

## Tests

Tests live outside `src`:

```txt
tests/
  unit/
  integration/
    routes/
  helpers/
  fixtures/
```

Route/controller tests that use Supertest belong under `tests/integration/routes`.

## Migration Order

Move one module at a time and run the core test suite after every module.

Current first-pass migration order:

1. groups - migrated
2. settings - migrated
3. users - migrated
4. auth - migrated
5. audit - migrated
6. clients - migrated
7. discovery - migrated
8. metrics - migrated as an internal domain module
9. analytics - migrated
10. behavior - migrated as an internal domain module
11. security - migrated as a cross-cutting module
12. jobs and background schedulers - migrated to `src/system`

## Planned Features

### Screen Monitoring Module (Proposed)

A new feature module for real-time screen monitoring with privacy-conscious design.

#### Module Structure
```
src/modules/screen-monitor/
  screen-monitor.route.js
  screen-monitor.controller.js
  screen-monitor.service.js
  screen-monitor.repository.js
```

#### Technical Approach
- **Primary Focused Stream**: WebRTC for low-latency, real-time streaming of the actively selected screen
- **Background Tile Previews**: Periodic screenshots (every 2-5 seconds) for non-focused screens to minimize network bandwidth
- **Privacy Controls**: 
  - Explicit user consent notification before monitoring begins
  - Visual indicator on client machines when screen is being monitored
  - Option to blur sensitive regions or exclude specific applications
- **Data Flow**:
  - Agent captures screen via native APIs (Windows Graphics Capture, etc.)
  - Focused screen: Encoded WebRTC stream -> Core -> Dashboard (via Socket.io)
  - Background tiles: JPEG/PNG screenshots -> Core REST API -> Database -> Dashboard polling
  - Control commands: Dashboard -> Core Socket.io -> Agent Socket.io

#### Storage & Retention
- Real-time streams are not persisted (ephemeral)
- Screen captures may be temporarily buffered for replay functionality
- Configuration options for retention policies (e.g., keep last 1 hour of captures)

#### Security Considerations
- All screen data encrypted in transit (WebRTC DTLS, HTTPS for REST)
- Access control integrated with existing RBAC system
- Audit logging for screen monitoring activation/access