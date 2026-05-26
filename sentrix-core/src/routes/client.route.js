import * as clientControllers from "../controllers/client.controller.js";
import express from "express";
import { requireRole } from "../middlewares/auth.middleware.js";

const clientRouter = express.Router();

clientRouter.get("/", clientControllers.getAllClients);
clientRouter.get("/:id/metrics", clientControllers.getClientMetrics);
clientRouter.get("/:id/hardware", clientControllers.getClientHardware);
clientRouter.get("/:id/processes", clientControllers.getClientProcesses);
clientRouter.get("/:id/network-activity", clientControllers.getClientNetworkActivity);
clientRouter.get("/:id/activity-history", clientControllers.getClientActivityHistory);
clientRouter.get("/:id/peripherals/history", clientControllers.getClientPeripheralHistory);
clientRouter.patch("/:id/peripherals/:key/resolve", requireRole("network_admin"), clientControllers.resolvePeripheral);
clientRouter.patch("/:id/peripherals/:key/archive", requireRole("network_admin"), clientControllers.archivePeripheral);
clientRouter.patch("/:id/peripherals/:key/recover", requireRole("network_admin"), clientControllers.recoverPeripheral);
clientRouter.get("/:id/events", clientControllers.getClientEvents);
clientRouter.get("/:id/domains", clientControllers.getClientDomains);
clientRouter.get("/:id/software", clientControllers.getClientSoftware);
clientRouter.get("/:id/health", clientControllers.getClientHealth);
clientRouter.get("/:id/anomalies", clientControllers.getClientAnomalies);
clientRouter.get("/:id", clientControllers.getClient);
clientRouter.patch("/:id/group", clientControllers.updateClientGroup);
clientRouter.delete("/:id", clientControllers.archiveClient);
clientRouter.post("/:id/command", clientControllers.sendClientCommand);
clientRouter.post("/:id/processes/:pid/kill", clientControllers.killClientProcess);

export default clientRouter;
