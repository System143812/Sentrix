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

  if (process.platform === "win32") {
    return process.env.SENTRIX_AGENT_DATA_DIR
      || path.join(
        process.env.LOCALAPPDATA || os.homedir(),
        "SentrixAgent",
      );
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

  if (fs.existsSync(idFilePath)) {
    return fs.readFileSync(idFilePath, "utf8").trim();
  }

  const id = crypto.randomUUID();
  fs.writeFileSync(idFilePath, id);

  return id;
}
