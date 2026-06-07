import express from "express";
import { scan, deploy, getSnapshot, getInterfaces } from "../controllers/discovery.controller.js";
import { authenticate, requireRole } from "../middlewares/auth.middleware.js";

const discoveryRouter = express.Router();

discoveryRouter.use(authenticate);
discoveryRouter.get("/", getSnapshot);
discoveryRouter.post("/scan", requireRole("network_admin"), scan);
discoveryRouter.get("/interfaces", getInterfaces);
discoveryRouter.post("/deploy", requireRole("network_admin"), deploy);

export default discoveryRouter;
