import express from "express";
import * as userController from "../controllers/user.controller.js";
import { authenticate, requireRole } from "../middlewares/auth.middleware.js";

const router = express.Router();

router.use(authenticate);
router.get("/", requireRole("network_admin"), userController.listUsers);
router.post("/", requireRole("network_admin"), userController.createAdmin);
router.delete("/:id", requireRole("network_admin"), userController.removeAdmin);

export default router;
