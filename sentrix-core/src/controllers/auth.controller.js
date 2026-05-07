import jwt from "jsonwebtoken";
import {
  getUserForAuth,
  createUser,
  countUsers,
  seedInitialAdmin,
  validatePassword,
} from "../services/user.services.js";

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
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials." });
    }

    if (!user.active) {
      return res
        .status(403)
        .json({ success: false, message: "Account disabled." });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      secret,
      { expiresIn: "8h" },
    );

    res.cookie("sentrix_token", token, getCookieOptions());

    return res.json({
      success: true,
      data: {
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
    res.clearCookie("sentrix_token", getCookieOptions());
    return res.json({ success: true, data: { message: "Logged out." } });
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
