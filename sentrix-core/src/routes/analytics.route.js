import express from "express";
import * as analyticsController from "../controllers/analytics.controller.js";

const analyticsRouter = express.Router();

analyticsRouter.get("/", analyticsController.getAnalytics);
analyticsRouter.get("/export.csv", analyticsController.exportAnalyticsCsv);

export default analyticsRouter;
