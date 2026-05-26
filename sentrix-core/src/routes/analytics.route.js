import express from "express";
import * as analyticsController from "../controllers/analytics.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";

const router = express.Router();

router.use(authenticate);

router.get("/", analyticsController.getSummary);
router.get("/export.csv", analyticsController.exportCsv);
router.get("/export.pdf", analyticsController.exportPdf);
router.get("/export.docx", analyticsController.exportDocx);

export default router;
