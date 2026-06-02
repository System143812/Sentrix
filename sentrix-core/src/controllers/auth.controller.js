import jwt from "jsonwebtoken";
import {
  getUserForAuth,
  createUser,
  countUsers,
  seedInitialAdmin,
  validatePassword,
  updateUserPassword,
} from "../services/user.services.js";
import { logAuditEvent } from "../services/audit.service.js";
import { 
  isUserRateLimited, 
  banDevice, 
  getRequestIp, 
  getRequestMac, 
  resolveMacFromIp, 
  authorizeDevice,
  recordSecurityIncident,
  getSecurityIncidentCount,
  clearSecurityIncidents
} from "../services/security.service.js";

const secret = process.env.JWT_SECRET || "sentrix-secret";

function getCookieOptions() {
  return {
    httpOnly: true,
    sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 8 * 60 * 60 * 1000,
    path: "/",
  };
}

export async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const user = await getUserForAuth(email);

    if (!user || !(await validatePassword(user, password))) {
      const ip = getRequestIp(req);
      const mac = getRequestMac(req) || await resolveMacFromIp(ip);
      
      // 1. Log persistent incident
      await recordSecurityIncident(req, 'login_failure');

      // 2. Check persistent counts (Last 30 mins)
      const ipCount = await getSecurityIncidentCount(ip);
      const macCount = mac ? await getSecurityIncidentCount(mac) : 0;

      console.log(`[AUTH] Failed login from IP: ${ip} (Persistent Count: ${ipCount}), MAC: ${mac || "Unknown"} (Persistent Count: ${macCount})`);

      // 3. Trigger Ban if EITHER counter hits limit (10)
      if (ipCount >= 10 || macCount >= 10) {
        console.warn(`[SECURITY] Threshold reached. Banning device: IP=${ip}, MAC=${mac || 'Unknown'}`);
        await banDevice(req, { reason: "Too many failed login attempts." });
        await clearSecurityIncidents(req);
      }

      await logAuditEvent({
        req,
        actor: { email, role: "unknown" },
        action: "login_failed",
        targetType: "user",
        targetLabel: email,
      });
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials." });
    }

    if (!user.active) {
      return res
        .status(403)
        .json({ success: false, message: "Account disabled." });
    }

    if (await isUserRateLimited(user)) {
      return res.status(403).json({ success: false, message: "Failed" });
    }

    // Success - reset all failure counters for this device
    await clearSecurityIncidents(req);

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      secret,
      { expiresIn: "8h" },
    );

    res.cookie("sentrix_token", token, getCookieOptions());

    // Auto-trust the device upon successful login
    await authorizeDevice(req, { label: user.email, type: 'user', identifier: user.id });

    await logAuditEvent({
      req,
      actor: user,
      action: "login_success",
      targetType: "user",
      targetId: user.id,
      targetLabel: user.email,
    });

    return res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function logout(req, res, next) {
  try {
    await logAuditEvent({
      req,
      action: "logout",
      targetType: "user",
      targetId: req.user?.id,
      targetLabel: req.user?.email,
    });
    res.clearCookie("sentrix_token", getCookieOptions());
    return res.json({ success: true, data: { message: "Logged out." } });
  } catch (error) {
    next(error);
  }
}

export async function updatePassword(req, res, next) {
  try {
    const { currentPassword, nextPassword } = req.body || {};
    const user = await updateUserPassword(req.user.id, currentPassword, nextPassword);

    await logAuditEvent({
      req,
      action: "credential_updated",
      targetType: "user",
      targetId: user.id,
      targetLabel: user.email,
    });

    res.json({ success: true, data: { id: user.id, email: user.email, role: user.role } });
  } catch (error) {
    next(error);
  }
}

export async function register(req, res, next) {
  try {
    const { email, password } = req.body;

    const total = await countUsers();

    if (total === 0) {
      const initialEmail = process.env.INITIAL_ADMIN_EMAIL || email;
      const initialPassword = process.env.INITIAL_ADMIN_PASSWORD || password;
      const user = await seedInitialAdmin({
        email: initialEmail,
        password: initialPassword,
      });
      return res.json({ success: true, data: user });
    }

    return res
      .status(403)
      .json({ success: false, message: "Registration disabled." });
  } catch (error) {
    next(error);
  }
}

export async function me(req, res, next) {
  try {
    if (!req.user) {
      return res
        .status(401)
        .json({ success: false, message: "Authentication required." });
    }

    return res.json({
      success: true,
      data: {
        id: req.user.id,
        email: req.user.email,
        role: req.user.role,
      },
    });
  } catch (error) {
    next(error);
  }
}
