import {
  getAllGroups,
  createGroup,
  deleteGroup,
  resetClientsGroup,
  getGroupById,
  updateGroup,
  renameClientsGroup,
} from "../services/group.services.js";
import { logAuditEvent } from "../services/audit.service.js";

export async function listGroups(req, res, next) {
  try {
    const groups = await getAllGroups();
    return res.json({ success: true, data: groups });
  } catch (error) {
    next(error);
  }
}

export async function createNewGroup(req, res, next) {
  try {
    const { name, description } = req.body;
    const group = await createGroup({ name, description });
    await logAuditEvent({
      req,
      action: "group_created",
      targetType: "group",
      targetId: group.id,
      targetLabel: group.name,
    });

    const io = req.app.get("io");
    if (io) {
      io.to("dashboards").emit("groups:update");
    }

    return res.status(201).json({ success: true, data: group });
  } catch (error) {
    next(error);
  }
}

export async function updateGroupById(req, res, next) {
  try {
    const { name, description } = req.body;
    const group = await getGroupById(req.params.id);

    if (!group) {
      return res
        .status(404)
        .json({ success: false, message: "Group not found." });
    }

    const updated = await updateGroup(req.params.id, { name, description });
    await renameClientsGroup(group.name, updated.name);
    await logAuditEvent({
      req,
      action: "group_updated",
      targetType: "group",
      targetId: updated.id,
      targetLabel: updated.name,
      details: { previousName: group.name },
    });

    const io = req.app.get("io");
    if (io) {
      io.to("dashboards").emit("groups:update");
    }

    return res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
}

export async function deleteGroupById(req, res, next) {
  try {
    const group = await getGroupById(req.params.id);
    if (!group) {
      return res
        .status(404)
        .json({ success: false, message: "Group not found." });
    }
    const deleted = await deleteGroup(req.params.id);
    if (!deleted) {
      return res
        .status(404)
        .json({ success: false, message: "Group not found." });
    }
    await resetClientsGroup(group.name);
    await logAuditEvent({
      req,
      action: "group_deleted",
      targetType: "group",
      targetId: group.id,
      targetLabel: group.name,
    });

    const io = req.app.get("io");
    if (io) {
      io.to("dashboards").emit("groups:update");
    }

    return res.json({ success: true, message: "Group deleted." });
  } catch (error) {
    next(error);
  }
}
