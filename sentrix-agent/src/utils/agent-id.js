import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

async function getAgentDataDir() {
  if (process.versions?.electron) {
    const electron = await import("electron");
    const app = electron.default?.app || electron.app;

    if (app?.getPath) {
      return app.getPath("userData");
    }
  }

  // Unified location for Sentrix data on Windows
  if (process.platform === "win32") {
    return "C:\\ProgramData\\SentrixAgent";
  }

  return path.join(os.homedir(), ".sentrix-agent");
}

export function getAgentId() {
  throw new Error("Use getAgentIdAsync() in ESM agent code.");
}

export async function getAgentIdAsync() {
  let dataDir = await getAgentDataDir();

  try {
    fs.mkdirSync(dataDir, { recursive: true });
  } catch {
    dataDir = path.join(process.cwd(), ".sentrix-agent");
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const idFilePath = path.join(dataDir, "agent-id.txt");
  const envId = process.env.SENTRIX_AGENT_ID;

  // 1. If an ID is provided via Environment (Server-Pushed), it is the SOURCE OF TRUTH.
  if (envId) {
    // If it differs from the local file, update the local file to match.
    if (!fs.existsSync(idFilePath) || fs.readFileSync(idFilePath, "utf8").trim() !== envId) {
      console.log(`[Identity] Provisioning with server-provided ID: ${envId}`);
      fs.writeFileSync(idFilePath, envId);
    }
    return envId;
  }

  // 2. Fallback to the local persisted file if no environment ID is present.
  if (fs.existsSync(idFilePath)) {
    return fs.readFileSync(idFilePath, "utf8").trim();
  }

  // 3. CRITICAL: No ID found. We no longer generate random IDs.
  // The agent must be provisioned via the Sentrix Dashboard or a manual .env file.
  throw new Error("Agent ID not found. This agent has not been provisioned. Please deploy it from the Sentrix Dashboard.");
}
