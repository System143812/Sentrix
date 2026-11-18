import express from "express";
import { authenticate, requireRole } from "../../middlewares/auth.middleware.js";
import * as filesController from "./files.controller.js";

const router = express.Router();

router.post("/stage", authenticate, requireRole("network_admin"), filesController.stageFile);
router.get("/staged/:token", filesController.downloadStagedFile);

export default router;
