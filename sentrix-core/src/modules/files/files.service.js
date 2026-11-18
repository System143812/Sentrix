import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { getStagingSettings } from "../settings/settings.service.js";

const STAGED_DIR = path.join(process.env.ProgramData || "C:\\ProgramData", "SentrixCore", "StagedFiles");

function ensureStagedDir() {
  if (!fs.existsSync(STAGED_DIR)) {
    try {
      fs.mkdirSync(STAGED_DIR, { recursive: true });
    } catch {
      const localDir = path.join(process.cwd(), "StagedFiles");
      if (!fs.existsSync(localDir)) {
        fs.mkdirSync(localDir, { recursive: true });
      }
      return localDir;
    }
  }
  return STAGED_DIR;
}

const activeStagedFiles = new Map(); // token -> { filePath, fileName, fileSize, expiresAt }

export async function stageFileFromStream(req, rawFileName) {
  const dir = ensureStagedDir();
  const fileName = path.basename(rawFileName || "upload.bin");
  const token = uuidv4();
  const filePath = path.join(dir, `${token}-${fileName}`);

  const settings = await getStagingSettings();
  const maxBytes = (settings.maxStagedFileSizeMb || 200) * 1024 * 1024;

  return new Promise((resolve, reject) => {
    const writeStream = fs.createWriteStream(filePath);
    let bytesReceived = 0;
    let aborted = false;

    req.on("data", (chunk) => {
      bytesReceived += chunk.length;
      if (bytesReceived > maxBytes) {
        aborted = true;
        req.unpipe();
        writeStream.destroy();
        try {
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } catch {}
        reject(new Error(`File size exceeds maximum allowed staged size of ${settings.maxStagedFileSizeMb}MB.`));
      }
    });

    req.pipe(writeStream);

    writeStream.on("error", (err) => {
      if (aborted) return;
      try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch {}
      reject(err);
    });

    writeStream.on("finish", () => {
      if (aborted) return;
      const expiresAt = Date.now() + 60 * 60 * 1000; // 1 hour expiration
      const record = {
        token,
        filePath,
        fileName,
        fileSize: bytesReceived,
        expiresAt,
      };
      activeStagedFiles.set(token, record);
      resolve(record);
    });
  });
}

export function getStagedFileRecord(token) {
  const record = activeStagedFiles.get(token);
  if (!record) return null;
  if (Date.now() > record.expiresAt) {
    activeStagedFiles.delete(token);
    try {
      if (fs.existsSync(record.filePath)) fs.unlinkSync(record.filePath);
    } catch {}
    return null;
  }
  if (!fs.existsSync(record.filePath)) {
    activeStagedFiles.delete(token);
    return null;
  }
  return record;
}

export function stageBuffer(buffer, rawFileName) {
  const dir = ensureStagedDir();
  const fileName = path.basename(rawFileName || "download.bin");
  const token = uuidv4();
  const filePath = path.join(dir, `${token}-${fileName}`);

  fs.writeFileSync(filePath, buffer);
  const fileSize = buffer.length;
  const expiresAt = Date.now() + 60 * 60 * 1000; // 1 hour expiration

  const record = {
    token,
    filePath,
    fileName,
    fileSize,
    expiresAt,
  };
  activeStagedFiles.set(token, record);
  return record;
}

setInterval(() => {
  const now = Date.now();
  for (const [token, record] of activeStagedFiles.entries()) {
    if (now > record.expiresAt || !fs.existsSync(record.filePath)) {
      activeStagedFiles.delete(token);
      try {
        if (fs.existsSync(record.filePath)) fs.unlinkSync(record.filePath);
      } catch {}
    }
  }
}, 15 * 60 * 1000);
