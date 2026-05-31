import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  HeadingLevel,
  BorderStyle,
  VerticalAlign,
  ImageRun,
} from "docx";
import {
  generateLineChart,
  generateFullLogo,
} from "../metrics/chart.service.js";

export async function generateDocx(summary, options = {}) {
  const rangeKey = options.range || "24h";

  const healthTrendData = summary.trends.health.map((p) => p.value);
  const loadTrendData = summary.trends.cpu.map((cpu, i) => {
    const ram = summary.trends.ram[i].value;
    const disk = summary.trends.disk[i].value;
    return Math.round(((cpu.value || 0) + (ram || 0) + (disk || 0)) / 3);
  });
  const trendLabels = summary.trends.health.map((p) => p.label);

  const [healthChart, loadChart, logoBuffer] = await Promise.all([
    generateLineChart({
      title: "Fleet Health Trend (%)",
      labels: trendLabels,
      datasets: [
        { label: "Health Score", data: healthTrendData, color: "#10b981" },
      ],
    }),
    generateLineChart({
      title: "Resource Load Trend (%)",
      labels: trendLabels,
      datasets: [
        { label: "Aggregate Load", data: loadTrendData, color: "#3b82f6" },
      ],
    }),
    generateFullLogo(),
  ]);

  const doc = new Document({
    sections: [
      {
        properties: {
          page: { margin: { top: 720, bottom: 720, left: 720, right: 720 } }, // 0.5 inch for high density
        },
        children: [
          // --- PAGE 1: HEADER & INTRO ---
          new Paragraph({
            children: [
              new ImageRun({
                data: logoBuffer,
                transformation: { width: 180, height: 45 },
              }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `FOR: ${summary.filters.group.toUpperCase()}  |  PERIOD: ${summary.range.label}  |  AT: ${new Date(Number(summary.generatedAt)).toLocaleString()}`,
                size: 16,
                color: "64748b",
                bold: true,
              }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
          }),
          new Paragraph({
            text: "Sentrix Intelligence Report",
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "Fleet Performance & Security Analysis",
                color: "3b82f6",
                bold: true,
                size: 28,
              }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 800 },
          }),

          // --- 1. DETAILED FLEET BREAKDOWN ---
          new Paragraph({
            text: "Detailed Fleet Breakdown",
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 200, after: 200 },
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    children: [
                      new Paragraph({
                        text: "Aggregate CPU Usage",
                        bold: true,
                      }),
                    ],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        text: `${Math.round(summary.averages.cpu)}%`,
                      }),
                    ],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        text: "Aggregate RAM Usage",
                        bold: true,
                      }),
                    ],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        text: `${Math.round(summary.averages.ram)}%`,
                      }),
                    ],
                  }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({
                    children: [
                      new Paragraph({ text: "Fleet Disk Usage", bold: true }),
                    ],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        text: `${Math.round(summary.averages.disk)}%`,
                      }),
                    ],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({ text: "Avg Device Uptime", bold: true }),
                    ],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        text: `${(summary.averages.uptime / 3600).toFixed(1)} hrs`,
                      }),
                    ],
                  }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({
                    children: [
                      new Paragraph({ text: "Avg CPU Temp", bold: true }),
                    ],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        text: summary.averages.cpuTemperature
                          ? `${Math.round(summary.averages.cpuTemperature)}°C`
                          : "N/A",
                      }),
                    ],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({ text: "Avg GPU Temp", bold: true }),
                    ],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        text: summary.averages.gpuTemperature
                          ? `${Math.round(summary.averages.gpuTemperature)}°C`
                          : "N/A",
                      }),
                    ],
                  }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({
                    children: [
                      new Paragraph({ text: "Network Latency", bold: true }),
                    ],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        text: `${Math.round(summary.averages.latencyMs)} ms`,
                      }),
                    ],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({ text: "Packet Loss Rate", bold: true }),
                    ],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        text: `${summary.averages.packetLoss?.toFixed(2)}%`,
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),

          // --- 2. ALERT ANALYSIS ---
          new Paragraph({
            text: "Active Issue Analysis",
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 400, after: 100 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text:
                  summary.alerts.byType.length > 0
                    ? summary.alerts.byType
                        .slice(0, 4)
                        .map((a) => `${a.name}: ${a.count}`)
                        .join("   |   ")
                    : "System Status: OPTIMAL. No active issues detected across the fleet.",
                color: summary.alerts.byType.length > 0 ? "64748b" : "10b981",
                size: 18,
              }),
            ],
          }),

          // --- 3. TOP OUTLIERS ---
          new Paragraph({
            text: "Primary Device Outliers (Action Required)",
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 400, after: 100 },
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                tableHeader: true,
                children: [
                  "Device Hostname",
                  "Group",
                  "Health Score",
                  "Primary Issues",
                ].map(
                  (text) =>
                    new TableCell({
                      children: [new Paragraph({ text, bold: true })],
                      shading: { fill: "f1f5f9" },
                    }),
                ),
              }),
              ...summary.devices.outliers.slice(0, 3).map(
                (d) =>
                  new TableRow({
                    children: [
                      new TableCell({
                        children: [
                          new Paragraph({ text: d.hostname, color: "f43f5e" }),
                        ],
                      }),
                      new TableCell({
                        children: [new Paragraph({ text: d.group })],
                      }),
                      new TableCell({
                        children: [
                          new Paragraph({
                            text: `${d.health}%`,
                            bold: true,
                            color: "f43f5e",
                          }),
                        ],
                      }),
                      new TableCell({
                        children: [
                          new Paragraph({
                            text:
                              d.issues.slice(0, 2).join(", ") ||
                              "No specific issues",
                          }),
                        ],
                      }),
                    ],
                  }),
              ),
            ],
          }),

          // --- 4. EXECUTIVE SUMMARY (BOTTOM OF PAGE 1) ---
          new Paragraph({
            text: "Executive Summary Status",
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 600, after: 400 },
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: BorderStyle.NONE,
            rows: [
              new TableRow({
                children: [
                  {
                    label: "Avg Fleet Health",
                    value: `${summary.averages.health}%`,
                    color: "10b981",
                  },
                  {
                    label: "Online Units",
                    value: `${summary.totals.online} / ${summary.totals.total}`,
                    color: "3b82f6",
                  },
                  {
                    label: "Critical Alerts",
                    value: String(summary.alerts.critical),
                    color: "f43f5e",
                  },
                ].map(
                  (card) =>
                    new TableCell({
                      children: [
                        new Paragraph({
                          children: [
                            new TextRun({
                              text: card.label,
                              size: 16,
                              color: "64748b",
                              bold: true,
                            }),
                          ],
                        }),
                        new Paragraph({
                          children: [
                            new TextRun({
                              text: card.value,
                              size: 36,
                              color: card.color,
                              bold: true,
                            }),
                          ],
                        }),
                      ],
                      shading: { fill: "f8fafc" },
                      margins: { top: 200, bottom: 200, left: 200, right: 200 },
                    }),
                ),
              }),
            ],
          }),

          // --- PAGE 2: TREND ANALYSIS ---
          new Paragraph({
            text: "Performance Trend Analysis",
            heading: HeadingLevel.HEADING_1,
            pageBreakBefore: true,
            spacing: { before: 400, after: 400 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `Historical analysis of fleet performance over the ${summary.range.label} period.`,
                italics: true,
                color: "64748b",
              }),
            ],
            spacing: { after: 400 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "Fleet Health & Stability",
                bold: true,
                size: 24,
              }),
            ],
            spacing: { before: 200, after: 100 },
          }),
          new Paragraph({
            children: [
              new ImageRun({
                data: healthChart,
                transformation: { width: 600, height: 300 },
              }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "Resource Load Analysis",
                bold: true,
                size: 24,
              }),
            ],
            spacing: { before: 400, after: 100 },
          }),
          new Paragraph({
            children: [
              new ImageRun({
                data: loadChart,
                transformation: { width: 600, height: 300 },
              }),
            ],
            alignment: AlignmentType.CENTER,
          }),

          // --- PAGE 3: TECHNICAL TABLES ---
          new Paragraph({
            text: "Device Performance Details",
            heading: HeadingLevel.HEADING_1,
            pageBreakBefore: true,
            spacing: { before: 400, after: 400 },
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                tableHeader: true,
                children: [
                  "Hostname",
                  "Group",
                  "Health",
                  "CPU",
                  "RAM",
                  "Processor",
                ].map(
                  (text) =>
                    new TableCell({
                      children: [
                        new Paragraph({ text, bold: true, color: "ffffff" }),
                      ],
                      shading: { fill: "1e293b" },
                      verticalAlign: VerticalAlign.CENTER,
                    }),
                ),
              }),
              ...summary.devices.rows.map(
                (d) =>
                  new TableRow({
                    children: [
                      d.hostname,
                      d.group,
                      `${d.health}%`,
                      `${d.metrics.cpu || 0}%`,
                      `${d.metrics.ram || 0}%`,
                      d.specs?.cpu || "Unknown",
                    ].map(
                      (text) =>
                        new TableCell({
                          children: [
                            new Paragraph({ text: String(text), size: 18 }),
                          ],
                        }),
                    ),
                  }),
              ),
            ],
          }),

          new Paragraph({
            text: "Peripheral Security & Inventory",
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 800, after: 400 },
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                tableHeader: true,
                children: [
                  "Hostname",
                  "Total Items",
                  "Connected",
                  "Missing Status",
                ].map(
                  (text) =>
                    new TableCell({
                      children: [new Paragraph({ text, bold: true })],
                      shading: { fill: "f1f5f9" },
                    }),
                ),
              }),
              ...(summary.peripherals?.byDevice || []).map(
                (d) =>
                  new TableRow({
                    children: [
                      d.hostname,
                      String(d.total),
                      String(d.connected),
                      {
                        text: d.missing > 0 ? `${d.missing} MISSING` : "SECURE",
                        color: d.missing > 0 ? "f43f5e" : "10b981",
                      },
                    ].map(
                      (cell) =>
                        new TableCell({
                          children: [
                            new Paragraph({
                              children: [
                                new TextRun({
                                  text:
                                    typeof cell === "string" ? cell : cell.text,
                                  bold: typeof cell !== "string",
                                  color:
                                    typeof cell !== "string"
                                      ? cell.color
                                      : undefined,
                                  size: 18,
                                }),
                              ],
                            }),
                          ],
                        }),
                    ),
                  }),
              ),
            ],
          }),
        ],
      },
    ],
  });

  return await Packer.toBuffer(doc);
}
