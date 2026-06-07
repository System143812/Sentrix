import fs from "fs";
import path from "path";
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  PageBreak,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";

const outPath = path.resolve(
  process.cwd(),
  "../docs/Sentrix_Capstone_NonGraph_Documentation.docx",
);

const COLORS = {
  navy: "0F172A",
  slate: "475569",
  muted: "64748B",
  line: "CBD5E1",
  pale: "F8FAFC",
  paleBlue: "EFF6FF",
  blue: "2563EB",
  green: "059669",
  red: "DC2626",
  amber: "D97706",
  white: "FFFFFF",
};

function text(text, options = {}) {
  return new TextRun({
    text,
    font: "Aptos",
    size: options.size || 22,
    bold: options.bold,
    italics: options.italics,
    color: options.color || COLORS.navy,
    break: options.break,
  });
}

function para(children, options = {}) {
  return new Paragraph({
    children: Array.isArray(children) ? children : [text(children)],
    alignment: options.alignment,
    heading: options.heading,
    pageBreakBefore: options.pageBreakBefore,
    spacing: {
      before: options.before ?? 0,
      after: options.after ?? 160,
      line: options.line ?? 300,
    },
    bullet: options.bullet,
    indent: options.indent,
    border: options.border,
    shading: options.shading,
  });
}

function h1(label, pageBreakBefore = false) {
  return para([text(label, { bold: true, size: 32, color: COLORS.navy })], {
    heading: HeadingLevel.HEADING_1,
    pageBreakBefore,
    before: 260,
    after: 180,
  });
}

function h2(label) {
  return para([text(label, { bold: true, size: 26, color: COLORS.blue })], {
    heading: HeadingLevel.HEADING_2,
    before: 240,
    after: 120,
  });
}

function bullet(label) {
  return para([text(label, { size: 21, color: COLORS.slate })], {
    bullet: { level: 0 },
    after: 80,
  });
}

function cell(content, options = {}) {
  const children = Array.isArray(content)
    ? content
    : [para([text(String(content), { size: 19, color: options.color || COLORS.slate, bold: options.bold })], { after: 0 })];

  return new TableCell({
    children,
    verticalAlign: VerticalAlign.CENTER,
    shading: options.fill ? { fill: options.fill } : undefined,
    margins: { top: 120, bottom: 120, left: 140, right: 140 },
    width: options.width ? { size: options.width, type: WidthType.PERCENTAGE } : undefined,
  });
}

function table(headers, rows, widths = []) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: COLORS.line },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: COLORS.line },
      left: { style: BorderStyle.SINGLE, size: 1, color: COLORS.line },
      right: { style: BorderStyle.SINGLE, size: 1, color: COLORS.line },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "E2E8F0" },
      insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "E2E8F0" },
    },
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map((header, index) =>
          cell(header, {
            fill: COLORS.navy,
            color: COLORS.white,
            bold: true,
            width: widths[index],
          }),
        ),
      }),
      ...rows.map(
        (row) =>
          new TableRow({
            children: row.map((item, index) =>
              cell(item, {
                fill: index === 0 ? COLORS.pale : undefined,
                bold: index === 0,
                width: widths[index],
              }),
            ),
          }),
      ),
    ],
  });
}

function placeholder(label, description) {
  return para(
    [
      text(label, { bold: true, color: COLORS.blue, size: 21 }),
      text(`\n${description}`, { color: COLORS.muted, size: 19 }),
    ],
    {
      shading: { fill: COLORS.paleBlue },
      border: {
        top: { style: BorderStyle.SINGLE, size: 8, color: "BFDBFE" },
        bottom: { style: BorderStyle.SINGLE, size: 8, color: "BFDBFE" },
        left: { style: BorderStyle.SINGLE, size: 8, color: "BFDBFE" },
        right: { style: BorderStyle.SINGLE, size: 8, color: "BFDBFE" },
      },
      before: 80,
      after: 120,
    },
  );
}

const screenshotRows = [
  ["Login Page", "Login screen", "Shows authentication entry point."],
  ["Home Dashboard", "Dashboard overview/home page", "Shows summary cards and live monitoring overview."],
  ["Devices Page", "Devices table", "Shows registered clients, status, IP/MAC, grouping, and device management."],
  ["Expanded Device Details", "Expanded device details panel", "Shows hardware specifications, network activity, processes, peripherals, or remote controls."],
  ["Network Scan Page", "Network discovery page", "Shows discovered devices, hostnames, IP/MAC addresses, agent status, and deploy actions."],
  ["Deploy Dialog", "Deployment credential/action dialog", "Shows deploy, activate, or update flow for Windows Pro targets."],
  ["Analytics Page", "Analytics/reporting page", "Shows charts, trends, device comparison, and export options."],
  ["Audit Logs Page", "Audit logs tab", "Shows recorded system/user actions with actor, target, and network context."],
  ["Security Perimeter Tab", "Audit security/perimeter tab", "Shows blocked IP/MAC identities and unblock controls."],
  ["Trusted Fleet/Whitelist Tab", "Audit whitelist tab", "Shows trusted devices or manually authorized IP/MAC records."],
  ["Settings Page", "Settings/admin utility page", "Shows configurable system options."],
  ["Windows Task Scheduler Agent", "Task Scheduler showing Sentrix Agent and Sentrix Helper", "Shows successful agent installation, especially for Windows Home/manual installation."],
];

const functionalRequirements = [
  ["FR-01", "The system shall allow users to log in using registered credentials."],
  ["FR-02", "The system shall enforce role-based access control for network administrator and staff/admin users."],
  ["FR-03", "The system shall display a dashboard summary of monitored laboratory devices."],
  ["FR-04", "The system shall scan the local network for discoverable devices."],
  ["FR-05", "The system shall display discovered devices with hostname, IP address, MAC address, vendor, type, and agent status when available."],
  ["FR-06", "The system shall support agent deployment, activation, or update for eligible Windows devices."],
  ["FR-07", "The system shall support manual agent installation for Windows Home devices where remote deployment is unavailable."],
  ["FR-08", "The system shall register the agent as a scheduled task so it starts automatically."],
  ["FR-09", "The system shall receive real-time telemetry from connected agents."],
  ["FR-10", "The system shall store historical metric samples for analytics and reporting."],
  ["FR-11", "The system shall display CPU, memory, disk, network, temperature, hardware, peripheral, process, and software information when available."],
  ["FR-12", "The system shall allow authorized users to send remote commands such as shutdown, restart, sleep, and process termination."],
  ["FR-13", "The system shall allow device grouping and group updates."],
  ["FR-14", "The system shall provide analytics charts, device comparison, and report exports."],
  ["FR-15", "The system shall record audit logs for important user and system actions."],
  ["FR-16", "The system shall allow network administrators to whitelist trusted IP/MAC identities."],
  ["FR-17", "The system shall allow network administrators to block IP/MAC identities."],
  ["FR-18", "The system shall allow network administrators to restore or partially unblock access by IP, MAC, or both."],
  ["FR-19", "The system shall store system settings and administrative configuration values."],
  ["FR-20", "The system shall show deployment failure messages when credentials, connectivity, firewall, UAC, or remote management issues prevent installation."],
];

const nonFunctionalRequirements = [
  ["NFR-01", "The dashboard shall provide responsive layouts for common desktop and mobile screen sizes."],
  ["NFR-02", "The system shall use real-time updates for live telemetry and audit events where possible."],
  ["NFR-03", "The backend shall validate authenticated requests before protected resources are accessed."],
  ["NFR-04", "The system shall retain historical data according to configured pruning and storage lifecycle settings."],
  ["NFR-05", "The agent shall reconnect to the core service after restarts or temporary disconnections."],
  ["NFR-06", "The system shall provide clear failure feedback during network scan and deployment operations."],
  ["NFR-07", "The system shall support maintainable modular services for metrics, discovery, analytics, audit, security, and settings."],
  ["NFR-08", "The system shall include automated tests for selected backend, dashboard, and agent modules."],
];

const securityRequirements = [
  ["SR-01", "The system shall authenticate dashboard users using JWT-based authentication."],
  ["SR-02", "The system shall restrict network scan and deployment actions to network administrators."],
  ["SR-03", "The system shall restrict whitelist, blacklist, and authority revocation actions to network administrators."],
  ["SR-04", "The system shall record actor, target, IP address, MAC address, and details for audit events when available."],
  ["SR-05", "The system shall support security authority categories for whitelist, rate-limit, and blacklist records."],
  ["SR-06", "The system shall support blocking by IP, MAC, or both."],
  ["SR-07", "The system shall support revocation or restoration of blocked identities."],
  ["SR-08", "The system shall record security incidents for persistent rate-limiting decisions."],
];

const agileRows = [
  ["Prototype 1", "Project foundation", "Repository structure, base backend, dashboard scaffold, and database setup."],
  ["Prototype 2", "Authentication and roles", "Login, JWT authentication, role-based access control, protected routes."],
  ["Prototype 3", "Network discovery", "Network scan API, discovery result storage, dashboard network scan view."],
  ["Prototype 4", "Agent telemetry", "Windows agent, hardware metrics, heartbeat, Socket.io communication."],
  ["Prototype 5", "Device monitoring", "Device table, device details, groups, process/network/peripheral views."],
  ["Prototype 6", "Deployment", "Dashboard deploy flow, provisioning script, WinRM/WMI/SMB deployment for Windows Pro."],
  ["Prototype 7", "Windows Home fallback", "Manual file transfer and scheduled-task installer for Windows Home devices."],
  ["Prototype 8", "Analytics and reporting", "Historical metrics, charts, comparison mode, PDF/DOCX/CSV exports."],
  ["Prototype 9", "Audit and security authority", "Audit logs, whitelist, blacklist, rate-limit, IP/MAC block and restore controls."],
  ["Prototype 10", "Refinement and testing", "Responsive UI, error handling, automated tests, deployment feedback, documentation."],
];

const children = [
  para([text("Sentrix", { bold: true, size: 52, color: COLORS.navy })], {
    alignment: AlignmentType.CENTER,
    before: 1800,
    after: 120,
  }),
  para([text("Capstone System Documentation", { bold: true, size: 34, color: COLORS.blue })], {
    alignment: AlignmentType.CENTER,
    after: 240,
  }),
  para([text("Non-Graph Documentation Package", { size: 24, color: COLORS.muted })], {
    alignment: AlignmentType.CENTER,
    after: 900,
  }),
  para([text("Prepared for academic capstone documentation", { size: 22, color: COLORS.slate })], {
    alignment: AlignmentType.CENTER,
    after: 80,
  }),
  para([text(`Generated: ${new Date().toLocaleDateString()}`, { size: 20, color: COLORS.muted })], {
    alignment: AlignmentType.CENTER,
    after: 1000,
  }),
  para([text("Included Sections", { bold: true, size: 24, color: COLORS.navy })], {
    alignment: AlignmentType.CENTER,
    after: 120,
  }),
  para([text("System Overview | Screenshot Placeholders | System Architecture | System Requirements | Hardware Requirements | Software Requirements | Agile Prototyping", { size: 20, color: COLORS.slate })], {
    alignment: AlignmentType.CENTER,
    after: 0,
  }),
  para([new PageBreak()]),

  h1("1. System Overview"),
  para("Sentrix is a real-time network monitoring and remote management system designed for Windows computer laboratory environments. The system allows authorized administrators to discover devices in a local network, install or activate a monitoring agent, collect hardware and network telemetry, review device health, generate analytics reports, and manage security access through audit and IP/MAC authority controls.", { after: 180 }),
  para("The system is composed of three main applications:", { after: 100 }),
  bullet("Sentrix Dashboard - React-based web interface used by administrators and staff."),
  bullet("Sentrix Core - Node.js/Express backend that handles authentication, APIs, Socket.io events, database persistence, discovery, deployment, audit, analytics, and security decisions."),
  bullet("Sentrix Agent - Windows-based background agent that runs on laboratory PCs, reports telemetry, tracks software/peripherals/network activity, and receives remote commands."),

  h1("2. Screenshot Placeholders", true),
  para("The following placeholders identify where screenshots should be inserted in the final capstone manuscript. Each screenshot should be captured from the current running system and placed near the relevant discussion section.", { after: 200 }),
  table(["Placeholder", "Screenshot to Insert", "Purpose"], screenshotRows, [26, 34, 40]),
  h2("Screenshot Insertion Blocks"),
  ...screenshotRows.map((row) => placeholder(`[Insert Screenshot: ${row[0]}]`, `${row[1]} - ${row[2]}`)),

  h1("3. System Architecture", true),
  h2("Presentation Layer"),
  para("The presentation layer is the Sentrix Dashboard, built with React, Vite, Tailwind CSS, and Lucide icons. It provides user-facing pages for login, home monitoring, devices, network scanning, analytics, audit/security, and settings."),
  bullet("Display live device status and telemetry."),
  bullet("Provide filtering, search, pagination, and responsive layouts."),
  bullet("Trigger administrative actions such as scanning, deployment, group updates, remote commands, and security actions."),
  bullet("Subscribe to Socket.io events for live audit and telemetry updates."),

  h2("Application and API Layer"),
  para("The application layer is Sentrix Core, implemented with Node.js and Express. It exposes REST API routes for authentication, clients, discovery, analytics, audit, settings, users, and groups."),
  bullet("Authenticate users using JWT."),
  bullet("Enforce role-based access control."),
  bullet("Handle business logic for device management, deployment, reporting, and audit/security workflows."),
  bullet("Normalize and persist data received from agents."),
  bullet("Serve real-time events through Socket.io."),

  h2("Real-Time Communication Layer"),
  para("Sentrix uses Socket.io for real-time communication between agents, the core server, and dashboard clients."),
  bullet("Receive telemetry and heartbeat events from agents."),
  bullet("Send live device and audit updates to dashboard clients."),
  bullet("Send remote commands from the dashboard/core to connected agents."),

  h2("Agent Layer"),
  para("The Sentrix Agent runs on Windows client PCs. It is packaged as a headless executable and registered through Windows Task Scheduler. A helper executable can also run in the user session when required."),
  bullet("Collect CPU, memory, disk, network, temperature, peripheral, process, software, and activity data."),
  bullet("Maintain connection with Sentrix Core."),
  bullet("Execute approved remote management commands."),
  bullet("Run automatically after restart using scheduled tasks."),

  h2("Data Persistence Layer"),
  para("The persistence layer uses MySQL. It stores users, clients, hardware profiles, telemetry samples, network activity, software inventory, peripheral events, discovery results, deployment records, audit logs, system settings, security authority records, and incident records."),

  h2("Deployment Layer"),
  bullet("Windows Pro remote deployment - The target PC is prepared using Sentrix-PC-Provisioner.ps1, then the dashboard deploy action uses credentials to copy the agent and register scheduled tasks through WinRM or WMI/SMB fallback."),
  bullet("Windows Home manual deployment - The agent is copied/uploaded locally and installed using Sentrix-Home-Installer.ps1, which registers the required scheduled tasks directly on the machine."),

  h2("Security and Audit Layer"),
  para("Sentrix maintains audit records and security authority records. Network administrators can whitelist trusted identities, manually block IP/MAC identities, view throttled identities, and restore access. The system also records security incidents for persistent rate-limiting decisions."),

  h1("4. System Requirements", true),
  h2("Functional Requirements"),
  table(["ID", "Requirement"], functionalRequirements, [18, 82]),
  h2("Non-Functional Requirements"),
  table(["ID", "Requirement"], nonFunctionalRequirements, [18, 82]),
  h2("Security Requirements"),
  table(["ID", "Requirement"], securityRequirements, [18, 82]),

  h1("5. Hardware Requirements", true),
  h2("Server/Core Machine"),
  table(["Component", "Minimum", "Recommended"], [
    ["Processor", "Dual-core 64-bit CPU", "Quad-core or higher CPU"],
    ["Memory", "4 GB RAM", "8 GB RAM or higher"],
    ["Storage", "20 GB free space", "50 GB or higher SSD storage"],
    ["Network", "Wired LAN adapter", "Gigabit LAN adapter"],
    ["Display", "Not required for headless use", "Monitor for local administration"],
  ], [25, 35, 40]),
  h2("Administrator Dashboard Machine"),
  table(["Component", "Minimum", "Recommended"], [
    ["Processor", "Dual-core CPU", "Quad-core CPU"],
    ["Memory", "4 GB RAM", "8 GB RAM"],
    ["Browser", "Modern Chromium/Firefox/Edge browser", "Latest stable browser"],
    ["Network", "Same network or routable access to Sentrix Core", "Stable LAN connection"],
  ], [25, 35, 40]),
  h2("Client Laboratory PCs"),
  table(["Component", "Minimum", "Recommended"], [
    ["Operating System", "Windows 10/11", "Windows 10/11 Pro for remote deployment"],
    ["Processor", "Dual-core CPU", "Quad-core CPU"],
    ["Memory", "4 GB RAM", "8 GB RAM"],
    ["Storage", "1 GB free space for agent files/logs", "2 GB or higher free space"],
    ["Network", "LAN/Wi-Fi connection to Sentrix Core", "Stable LAN connection"],
  ], [25, 35, 40]),
  h2("Network Requirements"),
  bullet("Client devices must be reachable by the Sentrix Core server."),
  bullet("Windows Pro remote deployment requires remote management capability through WinRM/WMI/SMB after provisioning."),
  bullet("Windows Home devices should use manual installation because dashboard remote deployment is not reliable on Windows Home."),
  bullet("Firewalls and endpoint security tools must allow the Sentrix agent to connect to the core server."),

  h1("6. Software Requirements", true),
  table(["Software", "Purpose"], [
    ["Node.js", "Runs Sentrix Core, Sentrix Dashboard development server, and agent build tools."],
    ["npm", "Installs and runs package scripts for dashboard, core, and agent."],
    ["MySQL Server", "Stores users, devices, telemetry, audit, analytics, security, and settings data."],
    ["Git", "Version control and development history."],
    ["PowerShell", "Runs provisioning, build, install, and deployment scripts."],
    ["Windows Task Scheduler", "Runs Sentrix Agent and Sentrix Helper automatically."],
    ["Web Browser", "Accesses the Sentrix Dashboard."],
    ["Nmap", "Optional network scanning enhancement."],
    ["WinRM/WMI/SMB", "Required for Windows Pro remote deployment workflow."],
    ["Windows Defender Exclusions", "Optional but used by scripts to reduce agent interruption."],
  ], [30, 70]),
  h2("Main Technology Stack"),
  bullet("Frontend: React, Vite, Tailwind CSS, Socket.io Client, Lucide React."),
  bullet("Backend: Node.js, Express, Socket.io, MySQL2, JWT, bcrypt, Helmet, PDF/DOCX reporting libraries."),
  bullet("Agent: Node.js, packaged Windows executables, Electron optional UI/helper, systeminformation, PowerShell bridge scripts."),

  h1("7. Agile Prototyping", true),
  para("Sentrix followed an iterative prototyping process. Each prototype focused on delivering a usable system increment, then refining it based on implementation results and deployment constraints.", { after: 200 }),
  table(["Prototype", "Focus", "Output"], agileRows, [22, 28, 50]),
];

const doc = new Document({
  styles: {
    default: {
      document: {
        run: {
          font: "Aptos",
          size: 22,
          color: COLORS.navy,
        },
        paragraph: {
          spacing: { line: 300, after: 140 },
        },
      },
    },
  },
  sections: [
    {
      properties: {
        page: {
          margin: {
            top: 720,
            right: 720,
            bottom: 720,
            left: 720,
          },
        },
      },
      children,
    },
  ],
});

fs.mkdirSync(path.dirname(outPath), { recursive: true });
const buffer = await Packer.toBuffer(doc);
fs.writeFileSync(outPath, buffer);
console.log(outPath);
