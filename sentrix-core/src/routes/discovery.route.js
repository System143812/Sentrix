import express from "express";
import { scan, deploy, getSnapshot } from "../controllers/discovery.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";

const discoveryRouter = express.Router();

discoveryRouter.use(authenticate);
discoveryRouter.get("/", getSnapshot);
discoveryRouter.get("/scan", scan);
discoveryRouter.post("/deploy", deploy);

export default discoveryRouter;
