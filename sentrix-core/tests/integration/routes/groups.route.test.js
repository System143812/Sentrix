import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import groupRouter from "../../../src/modules/groups/groups.route.js";
import * as groupService from "../../../src/modules/groups/groups.service.js";
import { errorHandler } from "../../../src/middlewares/error.middleware.js";

vi.mock("../../../src/modules/groups/groups.service.js");
vi.mock("../../../src/modules/audit/audit.service.js");
vi.mock("../../../src/middlewares/auth.middleware.js", () => ({
  authenticate: (req, res, next) => {
    req.user = { id: 1 };
    next();
  },
  requireRole: () => (req, res, next) => next(),
}));

const app = express();
app.use(express.json());
app.use("/api/groups", groupRouter);
app.use(errorHandler);

describe("Groups route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET /api/groups", async () => {
    groupService.getAllGroups.mockResolvedValue([{ name: "Lab A" }]);

    const res = await request(app).get("/api/groups");

    expect(res.status).toBe(200);
    expect(res.body.data[0].name).toBe("Lab A");
  });

  it("POST /api/groups", async () => {
    groupService.createGroup.mockResolvedValue({ id: 1, name: "Lab B" });

    const res = await request(app).post("/api/groups").send({ name: "Lab B" });

    expect(res.status).toBe(201);
  });

  it("PATCH /api/groups/:id", async () => {
    groupService.getGroupById.mockResolvedValue({ id: 1, name: "Lab A" });
    groupService.updateGroup.mockResolvedValue({ id: 1, name: "Lab Updated" });

    const res = await request(app)
      .patch("/api/groups/1")
      .send({ name: "Lab Updated" });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe("Lab Updated");
  });

  it("DELETE /api/groups/:id", async () => {
    groupService.getGroupById.mockResolvedValue({ id: 1, name: "Lab A" });
    groupService.deleteGroup.mockResolvedValue(true);

    const res = await request(app).delete("/api/groups/1");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("DELETE /api/groups/:id returns 404 when missing", async () => {
    groupService.getGroupById.mockResolvedValue(null);

    const res = await request(app).delete("/api/groups/99");

    expect(res.status).toBe(404);
  });
});
