import express from "express";
import * as analyticsController from "../controllers/analytics.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";

const router = express.Router();

router.use(authenticate);

router.get("/", analyticsController.getSummary);
router.get("/export.csv", analyticsController.exportCsv);

export default router;
