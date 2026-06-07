import cookieParser from "cookie-parser";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import router from "./routes/main.route.js";
import { notFound, errorHandler } from "./middlewares/error.middleware.js";
import jwt from "jsonwebtoken";
import { isUserRateLimited, isRequestRateLimited, isRequestAuthorized } from "./services/security.service.js";

const JWT_SECRET = process.env.JWT_SECRET || "sentrix-secret";

function getClientUrls() {
  const urls =
    process.env.CLIENT_URLS ||
    process.env.CLIENT_URL ||
    "https://localhost:5173,https://localhost:5174";
  return urls
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);
}

function isDevDashboardOrigin(origin) {
  if (process.env.NODE_ENV === "production") return false;

  try {
    const { hostname, port } = new URL(origin);
    const isDashboardPort = port === "5173" || port === "5174";
    const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1";
    const isPrivateLan =
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
      /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname);

    return (
      isDashboardPort &&
      (isLocalhost || isPrivateLan)
    );
  } catch {
    return false;
  }
}

function createCorsOrigin(clientUrls) {
  return (origin, callback) => {
    if (!origin || clientUrls.includes(origin) || isDevDashboardOrigin(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`Origin ${origin} is not allowed by CORS.`));
  };
}

function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());

  const clientUrls = getClientUrls();
  app.use(
    cors({
      origin: createCorsOrigin(clientUrls),
      credentials: true,
      methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
    }),
  );

  app.use(express.json({ limit: "10kb" }));
  app.use(express.urlencoded({ extended: false, limit: "10kb" }));
  app.use(cookieParser());

  app.use(async (req, res, next) => {
    try {
      // Pre-auth: Try to identify the user if a token is present
      const authHeader = req.headers.authorization || "";
      const token = (authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null) || req.cookies?.sentrix_token;

      if (token) {
        try {
          const decoded = jwt.verify(token, JWT_SECRET);
          if (decoded && !(await isUserRateLimited(decoded))) {
            req.user = decoded;
          }
        } catch (err) {
          // Token invalid or expired, proceed as guest for now
        }
      }

      if (await isRequestRateLimited(req)) {
        return res.status(403).json({ success: false, message: "Blocked" });
      }

      const path = req.path.toLowerCase();
      // Ensure we check for both the raw path and the /api prefixed path
      const isOpenPath =
        path.includes("/auth/login") ||
        path.includes("/auth/logout") ||
        path.includes("/auth/register") ||
        path.includes("/auth/me") ||
        path.includes("/health");

      if (path === "/health" || path === "/api/health") {
        return res.send(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Sentrix | Authorized</title>
              <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0">
              <style>
                * { box-sizing: border-box; }
                body { 
                  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; 
                  display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; 
                  background: #f8fafc; color: #0f172a; text-align: center;
                  padding: 24px;
                }
                .card { 
                  background: white; padding: 3rem 2rem; border: 1px solid #e2e8f0;
                  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.08); 
                  max-width: 380px; width: 100%; border-radius: 2.5rem;
                  animation: slideUp 0.5s ease-out;
                }
                @keyframes slideUp {
                  from { opacity: 0; transform: translateY(20px); }
                  to { opacity: 1; transform: translateY(0); }
                }
                .icon { color: #059669; margin-bottom: 2rem; }
                h1 { font-size: 1.75rem; margin: 0 0 1rem 0; font-weight: 800; letter-spacing: -0.025em; }
                p { font-size: 0.95rem; color: #64748b; line-height: 1.7; margin: 0; }
                .status-badge {
                  display: inline-block;
                  padding: 0.6rem 1.25rem;
                  background: #f0fdf4;
                  color: #166534;
                  border-radius: 2rem;
                  font-size: 0.75rem;
                  font-weight: 700;
                  text-transform: uppercase;
                  letter-spacing: 0.05em;
                  margin-top: 2.5rem;
                  border: 1px solid #dcfce7;
                }
              </style>
            </head>
            <body>
              <div class="card">
                <div class="icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><path d="m9 12 2 2 4-4"></path></svg>
                </div>
                <h1>Ready to go!</h1>
                <p>Connection authorized. You can now close this tab and return to the Sentrix Dashboard to sign in.</p>
                <div class="status-badge">
                  Connection Verified
                </div>
              </div>
            </body>
          </html>
        `);
      }

      if (isOpenPath) return next();

      if (await isRequestAuthorized(req)) return next();

      console.warn(`[SECURITY] Unauthorized access attempt to: ${req.method} ${req.originalUrl} from IP: ${req.ip}`);
      res.status(403).json({ success: false, message: "Unauthorized" });
    } catch (error) {
      console.error("[SECURITY] Middleware error:", error);
      res.status(403).json({ success: false, message: "Failed" });
    }
  });

  if (process.env.NODE_ENV === "production") {
    app.set("trust proxy", 1);
  }

  const authRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      message: "Too many authentication attempts. Please try again later.",
    },
  });

  app.use("/api/auth", authRateLimiter);

  app.use((req, res, next) => {
    if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
      const requestedWith = req.get("X-Requested-With");
      if (requestedWith !== "XMLHttpRequest") {
        return res.status(403).json({
          success: false,
          message: "Missing required request headers.",
        });
      }
    }
    next();
  });

  app.use("/", router);
  app.use(notFound);
  app.use(errorHandler);

  return app;
}

export default createApp;
