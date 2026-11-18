import * as filesService from "./files.service.js";
import { AppError } from "../../utils/appError.utils.js";
import { logAuditEvent } from "../audit/audit.service.js";
import fs from "fs";

export async function stageFile(req, res, next) {
  try {
    const rawFileName = req.headers["x-file-name"] || req.query.filename || "upload.bin";
    const decodedFileName = decodeURIComponent(rawFileName);

    const record = await filesService.stageFileFromStream(req, decodedFileName);

    const downloadUrl = `${req.protocol}://${req.get("host")}/api/files/staged/${record.token}`;

    await logAuditEvent({
      req,
      action: "file_staged",
      targetType: "system_staging",
      targetId: record.token,
      targetLabel: decodedFileName,
      details: { fileName: decodedFileName, fileSize: record.fileSize },
    });

    res.json({
      success: true,
      data: {
        token: record.token,
        fileName: decodedFileName,
        fileSize: record.fileSize,
        downloadUrl,
      },
    });
  } catch (error) {
    next(new AppError(error.message.includes("exceeds") ? 413 : 400, error.message));
  }
}

export async function downloadStagedFile(req, res, next) {
  try {
    const { token } = req.params;
    const record = filesService.getStagedFileRecord(token);

    if (!record) {
      throw new AppError(404, "Staged file not found or expired.");
    }

    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(record.fileName)}"`);
    res.setHeader("Content-Length", record.fileSize);
    res.setHeader("Content-Type", "application/octet-stream");

    const readStream = fs.createReadStream(record.filePath);
    readStream.on("error", (err) => {
      next(new AppError(500, `Failed to stream file: ${err.message}`));
    });
    readStream.pipe(res);
  } catch (error) {
    next(error);
  }
}
