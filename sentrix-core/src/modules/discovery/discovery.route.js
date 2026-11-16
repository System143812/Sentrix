import express from "express";
import { scan, deploy, cancelDeployment, getSnapshot, getInterfaces, downloadUpdateBundle, getServerCertificate } from "./discovery.controller.js";
import { authenticate, requireRole } from "../../middlewares/auth.middleware.js";

const discoveryRouter = express.Router();

discoveryRouter.get("/update/bundle", downloadUpdateBundle);
discoveryRouter.get("/certificate", getServerCertificate);

discoveryRouter.use(authenticate);
discoveryRouter.get("/", getSnapshot);
discoveryRouter.post("/scan", requireRole("network_admin"), scan);
discoveryRouter.get("/interfaces", getInterfaces);
discoveryRouter.post("/deploy", requireRole("network_admin"), deploy);
discoveryRouter.post("/cancel", requireRole("network_admin"), cancelDeployment);

export default discoveryRouter;
