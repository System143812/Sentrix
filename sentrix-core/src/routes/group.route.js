import express from "express";
import * as groupController from "../controllers/group.controller.js";
import { authenticate, requireRole } from "../middlewares/auth.middleware.js";

const router = express.Router();

router.use(authenticate);
router.get("/", groupController.listGroups);
router.post("/", requireRole("network_admin"), groupController.createNewGroup);
router.patch(
  "/:id",
  requireRole("network_admin"),
  groupController.updateGroupById,
);
router.delete(
  "/:id",
  requireRole("network_admin"),
  groupController.deleteGroupById,
);

export default router;
