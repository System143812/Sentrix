import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import filesRouter from "../../../src/modules/files/files.route.js";
import * as filesService from "../../../src/modules/files/files.service.js";
import { errorHandler } from "../../../src/middlewares/error.middleware.js";

vi.mock("../../../src/modules/files/files.service.js");
vi.mock("../../../src/modules/audit/audit.service.js");
vi.mock("../../../src/middlewares/auth.middleware.js", () => ({
  authenticate: (req, res, next) => {
    req.user = { id: 1, role: "network_admin" };
    next();
  },
  requireRole: () => (req, res, next) => next(),
}));

const app = express();
app.use("/api/files", filesRouter);
app.use(errorHandler);

describe("Files route & staging", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("POST /api/files/stage successfully stages a binary file stream", async () => {
    filesService.stageFileFromStream.mockResolvedValue({
      token: "test-token-123",
      fileName: "test.bin",
      fileSize: 2097152, // 2MB
      filePath: "/tmp/test-token-123-test.bin",
    });

    const fileBuffer = Buffer.alloc(2097152, "a");

    const res = await request(app)
      .post("/api/files/stage")
      .set("Content-Type", "application/octet-stream")
      .set("X-File-Name", "test.bin")
      .send(fileBuffer);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBe("test-token-123");
    expect(res.body.data.fileSize).toBe(2097152);
  });
});
