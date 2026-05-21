import * as clientControllers from "../controllers/client.controller.js";
import express from "express";

const clientRouter = express.Router();

clientRouter.get("/", clientControllers.getAllClients);
clientRouter.get("/:id/metrics", clientControllers.getClientMetrics);
clientRouter.get("/:id/hardware", clientControllers.getClientHardware);
clientRouter.get("/:id/processes", clientControllers.getClientProcesses);
clientRouter.get("/:id/network-activity", clientControllers.getClientNetworkActivity);
clientRouter.get("/:id/activity-history", clientControllers.getClientActivityHistory);
clientRouter.get("/:id", clientControllers.getClient);
clientRouter.patch("/:id/group", clientControllers.updateClientGroup);
clientRouter.delete("/:id", clientControllers.archiveClient);
clientRouter.post("/:id/processes/:pid/kill", clientControllers.killClientProcess);

export default clientRouter;
