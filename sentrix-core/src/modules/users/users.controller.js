import {
  getAllAdmins,
  createUser,
  deleteUser,
  getUserById,
  updateUserUsername,
} from "./users.service.js";
import { logAuditEvent } from "../audit/audit.service.js";

export async function listUsers(req, res, next) {
  try {
    const users = await getAllAdmins();
    return res.json({ success: true, data: users });
  } catch (error) {
    next(error);
  }
}

export async function createAdmin(req, res, next) {
  try {
    const { email, username, password } = req.body;
    const user = await createUser({ email, username, password, role: "admin" });
    await logAuditEvent({
      req,
      action: "admin_account_created",
      targetType: "user",
      targetId: user.id,
      targetLabel: user.username || user.email,
    });
    return res.status(201).json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
}

export async function removeAdmin(req, res, next) {
  try {
    const user = await getUserById(req.params.id);

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    }

    if (user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Only normal admin accounts can be removed here.",
      });
    }

    const success = await deleteUser(req.params.id);
    if (!success) {
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    }
    await logAuditEvent({
      req,
      action: "admin_account_deleted",
      targetType: "user",
      targetId: user.id,
      targetLabel: user.email,
    });
    return res.json({ success: true, message: "User deleted." });
  } catch (error) {
    next(error);
  }
}

export async function updateProfile(req, res, next) {
  try {
    const { username } = req.body;
    const user = await updateUserUsername(req.user.id, username);
    await logAuditEvent({
      req,
      action: "profile_updated",
      targetType: "user",
      targetId: user.id,
      targetLabel: user.username || user.email,
    });
    return res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
}
