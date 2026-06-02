import jwt from "jsonwebtoken";
import { isUserRateLimited } from "../services/security.service.js";

const secret = process.env.JWT_SECRET || "sentrix-secret";

export async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const headerToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;
  const cookieToken = req.cookies?.sentrix_token;
  const token = headerToken || cookieToken;

  if (!token) {
    return res
      .status(401)
      .json({ success: false, message: "Authentication required." });
  }

  try {
    const payload = jwt.verify(token, secret);
    if (await isUserRateLimited(payload)) {
      return res.status(403).json({ success: false, message: "Failed" });
    }
    req.user = payload;
    next();
  } catch (error) {
    return res
      .status(401)
      .json({ success: false, message: "Invalid or expired token." });
  }
}

export function requireRole(role) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ success: false, message: "Forbidden." });
    }
    next();
  };
}
