import { ChartJSNodeCanvas } from "chartjs-node-canvas";
import canvasPkg from "canvas";
const { createCanvas, Path2D } = canvasPkg;

const width = 800;
const height = 400;

// ... rest of imports/consts

/**
 * Draws the high-detail Sentrix Shield icon on a given context.
 */
function drawDetailedShield(ctx, x, y, scale = 1, color = "#ffffff") {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  
  // 1. Shield Outline
  ctx.strokeStyle = color;
  ctx.lineWidth = 5;
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(48, 5);
  ctx.lineTo(76, 17);
  ctx.lineTo(76, 35);
  ctx.bezierCurveTo(76, 52, 65, 62, 48, 68);
  ctx.bezierCurveTo(31, 62, 20, 52, 20, 35);
  ctx.lineTo(20, 17);
  ctx.closePath();
  ctx.stroke();

  // 2. Shield Inner Fill
  ctx.fillStyle = color === "#ffffff" ? "rgba(255, 255, 255, 0.12)" : "rgba(15, 23, 42, 0.1)";
  ctx.beginPath();
  ctx.moveTo(48, 14);
  ctx.lineTo(68, 22);
  ctx.lineTo(68, 36);
  ctx.bezierCurveTo(68, 47, 61, 55, 48, 60);
  ctx.bezierCurveTo(35, 55, 28, 47, 28, 36);
  ctx.lineTo(28, 22);
  ctx.closePath();
  ctx.fill();

  // 3. Data Waves (Detailed)
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  // Upper Wave
  ctx.beginPath();
  ctx.moveTo(8, 27); ctx.lineTo(32, 27);
  ctx.bezierCurveTo(40, 27, 42, 18, 48, 18);
  ctx.bezierCurveTo(54, 18, 56, 27, 64, 27);
  ctx.lineTo(88, 27);
  ctx.stroke();
  // Lower Wave
  ctx.beginPath();
  ctx.moveTo(8, 45); ctx.lineTo(32, 45);
  ctx.bezierCurveTo(40, 45, 42, 54, 48, 54);
  ctx.bezierCurveTo(54, 54, 56, 45, 64, 45);
  ctx.lineTo(88, 45);
  ctx.stroke();

  // 4. Vertical Logic Connectors
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(48, 21); ctx.lineTo(48, 51);
  ctx.moveTo(39, 27); ctx.lineTo(39, 45);
  ctx.moveTo(57, 27); ctx.lineTo(57, 45);
  ctx.stroke();

  // 5. Central Data Node (Cyan)
  ctx.fillStyle = "#14b8a6";
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(43, 31, 10, 12, 3);
  else ctx.rect(43, 31, 10, 12);
  ctx.fill();

  // 6. Right-side Edge Nodes
  ctx.fillStyle = color;
  const nodes = [17, 33, 49];
  nodes.forEach(nodeY => {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(82, nodeY, 9, 6, 1.5);
    else ctx.rect(82, nodeY, 9, 6);
    ctx.fill();
  });

  ctx.restore();
}

/**
 * Generates a high-resolution buffer of just the shield (for PDF).
 */
export async function generateShieldLogo() {
  const canvas = createCanvas(100, 80);
  const ctx = canvas.getContext("2d");
  drawDetailedShield(ctx, 0, 5, 1, "#ffffff");
  return canvas.toBuffer("image/png");
}

/**
 * Generates a full logo with wordmark (for DOCX).
 */
export async function generateFullLogo() {
  const canvas = createCanvas(400, 100);
  const ctx = canvas.getContext("2d");

  // Background (Dark Slate)
  ctx.fillStyle = "#0f172a";
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(0, 0, 400, 100, 12);
  else ctx.rect(0, 0, 400, 100);
  ctx.fill();

  // Calculate positions for centered content
  ctx.font = "bold 42px Helvetica";
  const text = "SENTRIX";
  const textMetrics = ctx.measureText(text);
  const textWidth = textMetrics.width;
  const shieldWidth = 80; // Scaled width (approx)
  const gap = 20;
  const totalContentWidth = shieldWidth + gap + textWidth;
  
  const startX = (400 - totalContentWidth) / 2;

  // High-detail logo placement
  drawDetailedShield(ctx, startX, 15, 1.0, "#ffffff");

  // Text "SENTRIX"
  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, startX + shieldWidth + gap, 68);

  return canvas.toBuffer("image/png");
}


// Professional Sentrix Brand Palette
const COLORS = {
  blue: "#3b82f6",
  emerald: "#10b981",
  rose: "#f43f5e",
  amber: "#f59e0b",
  slate: "#64748b",
  grid: "#e2e8f0",
  text: "#475569",
};

const chartJSNodeCanvas = new ChartJSNodeCanvas({ 
  width, 
  height,
  backgroundColour: "white"
});

/**
 * Generates a high-resolution line chart buffer.
 */
export async function generateLineChart(options = {}) {
  const { 
    labels = [], 
    datasets = [], 
    title = "", 
    isPercentage = true 
  } = options;

  const configuration = {
    type: "line",
    data: {
      labels,
      datasets: datasets.map(ds => ({
        label: ds.label,
        data: ds.data,
        borderColor: ds.color || COLORS.blue,
        backgroundColor: (ds.color || COLORS.blue) + "20", // 20% opacity
        borderWidth: 3,
        pointRadius: 4,
        pointBackgroundColor: "white",
        pointBorderWidth: 2,
        tension: 0.35, // Smooth curves
        fill: ds.fill ?? true,
      }))
    },
    options: {
      responsive: false,
      animation: false,
      plugins: {
        legend: {
          display: datasets.length > 1,
          position: "top",
          labels: {
            font: { size: 12, weight: "bold" },
            usePointStyle: true,
            padding: 20,
          }
        },
        title: {
          display: !!title,
          text: title,
          font: { size: 16, weight: "bold" },
          padding: { bottom: 20 }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { size: 10 }, color: COLORS.slate }
        },
        y: {
          beginAtZero: true,
          max: isPercentage ? 100 : undefined,
          grid: { color: COLORS.grid },
          ticks: { 
            font: { size: 10 }, 
            color: COLORS.slate,
            callback: (value) => isPercentage ? `${value}%` : value
          }
        }
      }
    }
  };

  return await chartJSNodeCanvas.renderToBuffer(configuration);
}

/**
 * Generates a high-resolution doughnut chart buffer for health/load distribution.
 */
export async function generateDoughnutChart(options = {}) {
  const { labels = [], data = [], colors = [] } = options;

  const configuration = {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors.length ? colors : [COLORS.emerald, COLORS.blue, COLORS.amber, COLORS.rose],
        borderWidth: 0,
        hoverOffset: 4
      }]
    },
    options: {
      responsive: false,
      animation: false,
      cutout: "70%",
      plugins: {
        legend: {
          position: "right",
          labels: {
            font: { size: 12, weight: "bold" },
            padding: 20,
            usePointStyle: true
          }
        }
      }
    }
  };

  return await chartJSNodeCanvas.renderToBuffer(configuration);
}
