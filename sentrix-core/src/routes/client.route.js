import * as clientControllers from "../controllers/client.controller.js";
import express from "express";

const clientRouter = express.Router();

clientRouter.get("/get", clientControllers.getAllClients);
clientRouter.post("/new", clientControllers.addToClients);

export default clientRouter;
