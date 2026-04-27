import clientRouter from "./client.route.js";
import express from "express";

const router = express.Router();

router.use("/api/client", clientRouter);

export default router;
