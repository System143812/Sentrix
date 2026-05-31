import PDFDocument from "pdfkit-table";
import {
  generateLineChart,
  generateShieldLogo,
} from "../metrics/chart.service.js";

export async function generatePdf(summary, options = {}) {
  const rangeKey = options.range || "24h";

  const healthTrendData = summary.trends.health.map((p) => p.value);
  const loadTrendData = summary.trends.cpu.map((cpu, i) => {
    const ram = summary.trends.ram[i].value;
    const disk = summary.trends.disk[i].value;
    return Math.round(((cpu.value || 0) + (ram || 0) + (disk || 0)) / 3);
  });
  const trendLabels = summary.trends.health.map((p) => p.label);

  const [healthChart, loadChart, shieldBuffer] = await Promise.all([
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
    generateShieldLogo(),
  ]);

  const doc = new PDFDocument({
    margin: 40,
    size: "A4",
    bufferPages: true,
    info: {
      Title: "Sentrix Lab Analytics Report",
      Author: "Sentrix Fleet Management",
    },
  });

  const buffers = [];
  doc.on("data", (chunk) => buffers.push(chunk));

  return new Promise((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(buffers)));

    // --- PAGE 1: HEADER & BRANDING ---
    doc
      .fillColor("#64748b")
      .fontSize(8)
      .font("Helvetica-Bold")
      .text(
        `FOR: ${summary.filters.group.toUpperCase()}  |  PERIOD: ${summary.range.label}  |  AT: ${new Date(Number(summary.generatedAt)).toLocaleString()}`,
        40,
        20,
      );

    doc.rect(0, 40, 600, 160).fill("#0f172a");
    doc.image(shieldBuffer, 40, 80, { width: 45 });

    doc
      .fillColor("#ffffff")
      .fontSize(26)
      .font("Helvetica-Bold")
      .text("Sentrix Lab Analytics", 95, 90);
    doc
      .fontSize(13)
      .font("Helvetica")
      .text("Fleet Performance & Security Report", 95, 120);
    doc.rect(95, 145, 40, 2.5).fill("#3b82f6");

    doc.x = 40;
    doc.y = 220;

    // --- 1. DETAILED FLEET BREAKDOWN ---
    doc
      .fillColor("#0f172a")
      .fontSize(9)
      .font("Helvetica-Bold")
      .text("Detailed Fleet breakdown", 40, doc.y, { align: "left" });
    doc.moveDown(0.3);

    const metricsTable = {
      headers: [
        { label: "Metric Type", property: "m1", align: "left" },
        { label: "Average Value", property: "v1", align: "left" },
        { label: "Metric Type", property: "m2", align: "left" },
        { label: "Average Value", property: "v2", align: "left" },
      ],
      rows: [
        [
          "Aggregate CPU Usage",
          `${Math.round(summary.averages.cpu)}%`,
          "Aggregate RAM Usage",
          `${Math.round(summary.averages.ram)}%`,
        ],
        [
          "Fleet Disk Usage",
          `${Math.round(summary.averages.disk)}%`,
          "Avg Device Uptime",
          `${(summary.averages.uptime / 3600).toFixed(1)} hrs`,
        ],
        [
          "Avg CPU Temperature",
          summary.averages.cpuTemperature
            ? `${Math.round(summary.averages.cpuTemperature)}°C`
            : "N/A",
          "Avg GPU Temperature",
          summary.averages.gpuTemperature
            ? `${Math.round(summary.averages.gpuTemperature)}°C`
            : "N/A",
        ],
        [
          "Network Latency",
          `${Math.round(summary.averages.latencyMs)} ms`,
          "Packet Loss Rate",
          `${summary.averages.packetLoss?.toFixed(2)}%`,
        ],
      ],
    };

    doc.table(metricsTable, {
      x: (595.28 - 500) / 2,
      width: 500,
      prepareHeader: () =>
        doc.font("Helvetica-Bold").fontSize(8).fillColor("#475569"),
      prepareRow: () => doc.font("Helvetica").fontSize(8).fillColor("#1e293b"),
    });

    doc.moveDown(1);

    // --- 2. ALERT ANALYSIS ---
    doc
      .fillColor("#0f172a")
      .fontSize(9)
      .font("Helvetica-Bold")
      .text("Active Issue Analysis", 40, doc.y, { align: "left" });
    doc.moveDown(0.4);

    if (summary.alerts.byType.length > 0) {
      const alertSummaryText = summary.alerts.byType
        .slice(0, 4)
        .map((a) => `${a.name}: ${a.count}`)
        .join("   |   ");
      doc
        .fillColor("#64748b")
        .fontSize(9)
        .font("Helvetica")
        .text(alertSummaryText, 40, doc.y, { align: "left", width: 515 });
    } else {
      doc
        .fillColor("#10b981")
        .fontSize(9)
        .font("Helvetica-Bold")
        .text(
          "System Status: OPTIMAL. No active issues detected across the fleet.",
          40,
          doc.y,
          { align: "left" },
        );
    }

    doc.moveDown(1.2);

    // --- 3. TOP OUTLIERS ---
    doc
      .fillColor("#0f172a")
      .fontSize(9)
      .font("Helvetica-Bold")
      .text("Primary Device Outliers (Action Required)", 40, doc.y, {
        align: "left",
      });
    doc.moveDown(0.4);

    const outlierTable = {
      headers: [
        { label: "Device Hostname", property: "hostname", align: "left" },
        { label: "Group", property: "group", align: "left" },
        { label: "Health Score", property: "health", align: "left" },
        { label: "Primary Issues", property: "issues", align: "left" },
      ],
      rows: summary.devices.outliers
        .slice(0, 3)
        .map((d) => [
          d.hostname,
          d.group,
          `${d.health}%`,
          d.issues.slice(0, 2).join(", ") || "No specific issues",
        ]),
    };

    doc.table(outlierTable, {
      x: (595.28 - 500) / 2,
      width: 500,
      prepareHeader: () =>
        doc.font("Helvetica-Bold").fontSize(8).fillColor("#475569"),
      prepareRow: (row, index) =>
        doc.font("Helvetica").fontSize(8).fillColor("#f43f5e"),
    });

    doc.moveDown(1.2);

    // --- 4. EXECUTIVE SUMMARY (KPI CARDS AT BOTTOM) ---
    doc
      .fillColor("#0f172a")
      .fontSize(9)
      .font("Helvetica-Bold")
      .text("Executive Summary Status", 40, doc.y, { align: "left" });
    doc.rect(40, doc.y + 2, 30, 2).fill("#10b981");
    doc.moveDown(1.5);

    const cardWidth = 165;
    const gutter = 10;
    let currentX = 40;
    let startY = doc.y;

    function drawKPICard(label, value, color, x, y) {
      doc.rect(x, y, cardWidth, 60).fillAndStroke("#ffffff", "#f1f5f9");
      doc.rect(x, y, 3, 60).fill(color);
      doc
        .fillColor("#64748b")
        .fontSize(7)
        .font("Helvetica-Bold")
        .text(label.toUpperCase(), x + 12, y + 12);
      doc
        .fillColor("#1e293b")
        .fontSize(18)
        .font("Helvetica-Bold")
        .text(value, x + 12, y + 28);
    }

    drawKPICard(
      "Avg Fleet Health",
      `${summary.averages.health}%`,
      "#10b981",
      currentX,
      startY,
    );
    currentX += cardWidth + gutter;
    drawKPICard(
      "Online Units",
      `${summary.totals.online} / ${summary.totals.total}`,
      "#3b82f6",
      currentX,
      startY,
    );
    currentX += cardWidth + gutter;
    drawKPICard(
      "Critical Alerts",
      String(summary.alerts.critical),
      "#f43f5e",
      currentX,
      startY,
    );

    doc.addPage();

    // --- PAGE 2: GRAPHS ---
    doc
      .fillColor("#0f172a")
      .fontSize(9)
      .font("Helvetica-Bold")
      .text("Performance Trend Analysis", 40, doc.y, { align: "left" });
    doc.rect(40, doc.y + 2, 30, 2).fill("#3b82f6");
    doc.moveDown(2);

    const chartWidth = 440;
    const centerX = (doc.page.width - chartWidth) / 2;

    doc.image(healthChart, centerX, doc.y, { width: chartWidth });
    doc.y += 240;
    doc.image(loadChart, centerX, doc.y, { width: chartWidth });

    doc.addPage();

    // --- PAGE 3: TABLES ---
    doc
      .fillColor("#0f172a")
      .fontSize(9)
      .font("Helvetica-Bold")
      .text("Device Performance Details", 40, doc.y, { align: "left" });
    doc.moveDown(1);

    const deviceTable = {
      headers: [
        { label: "Hostname", property: "hostname", width: 100, align: "left" },
        { label: "Group", property: "group", width: 80, align: "left" },
        { label: "Health", property: "health", width: 40, align: "left" },
        { label: "CPU", property: "cpu", width: 40, align: "left" },
        { label: "RAM", property: "ram", width: 40, align: "left" },
        { label: "Status", property: "status", width: 60, align: "left" },
        { label: "Processor", property: "specs", width: 135, align: "left" },
      ],
      datas: summary.devices.rows.map((d) => ({
        hostname: d.hostname,
        group: d.group,
        health: `${d.health}%`,
        cpu: `${d.metrics.cpu || 0}%`,
        ram: `${d.metrics.ram || 0}%`,
        status: d.status.toUpperCase(),
        specs: d.specs?.cpu || "Unknown",
      })),
    };

    doc.table(deviceTable, {
      x: (595.28 - 495) / 2,
      prepareHeader: () =>
        doc.font("Helvetica-Bold").fontSize(8).fillColor("#475569"),
      prepareRow: (row, index, column, rect, rectRow) => {
        doc.font("Helvetica").fontSize(8).fillColor("#1e293b");
        if (rectRow && index % 2 === 0)
          doc.addBackground(rectRow, "#f8fafc", 0.5);
      },
      padding: 8,
    });

    if (summary.groups.length > 0) {
      doc.moveDown(2);
      doc
        .fillColor("#0f172a")
        .fontSize(9)
        .font("Helvetica-Bold")
        .text("Group Distribution Analysis", 40, doc.y, { align: "left" });
      doc.moveDown(0.5);

      const groupTable = {
        headers: [
          { label: "Group", property: "group", align: "left" },
          { label: "Devices", property: "devices", align: "left" },
          { label: "Online", property: "online", align: "left" },
          { label: "Avg Health", property: "health", align: "left" },
          { label: "Avg Load", property: "load", align: "left" },
        ],
        rows: summary.groups.map((g) => [
          g.name,
          String(g.count),
          String(g.online),
          `${g.health}%`,
          `${g.load}%`,
        ]),
      };

      doc.table(groupTable, {
        x: (595.28 - 500) / 2,
        width: 500,
        prepareHeader: () =>
          doc.font("Helvetica-Bold").fontSize(8).fillColor("#475569"),
        prepareRow: () =>
          doc.font("Helvetica").fontSize(8).fillColor("#334155"),
      });
    }

    if (summary.peripherals?.byDevice?.length > 0) {
      doc.moveDown(2);
      doc
        .fillColor("#0f172a")
        .fontSize(9)
        .font("Helvetica-Bold")
        .text("Peripheral Security & Inventory", 40, doc.y, { align: "left" });
      doc.moveDown(0.5);

      const peripheralTable = {
        headers: [
          { label: "Hostname", property: "hostname", align: "left" },
          { label: "Total Items", property: "total", align: "left" },
          { label: "Connected", property: "connected", align: "left" },
          { label: "Status", property: "status", align: "left" },
        ],
        rows: summary.peripherals.byDevice.map((d) => [
          d.hostname,
          String(d.total),
          String(d.connected),
          d.missing > 0 ? `${d.missing} MISSING` : "SECURE",
        ]),
      };

      doc.table(peripheralTable, {
        x: (595.28 - 500) / 2,
        width: 500,
        prepareHeader: () =>
          doc.font("Helvetica-Bold").fontSize(8).fillColor("#475569"),
        prepareRow: (row, index) => {
          const isMissing = row[3] && String(row[3]).includes("MISSING");
          doc
            .font("Helvetica")
            .fontSize(8)
            .fillColor(isMissing ? "#f43f5e" : "#10b981");
        },
      });
    }

    // Final Footer Logic (Page Numbers)
    const rangeCount = doc.bufferedPageRange().count;
    for (let i = 0; i < rangeCount; i++) {
      doc.switchToPage(i);
      doc
        .fillColor("#94a3b8")
        .fontSize(7)
        .text(
          `Sentrix Intelligence Report | Page ${i + 1} of ${rangeCount}`,
          40,
          785,
          { align: "left" },
        );
    }

    doc.end();
  });
}
