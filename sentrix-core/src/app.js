import cookieParser from "cookie-parser";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import router from "./routes/main.route.js";
import { notFound, errorHandler } from "./middlewares/error.middleware.js";

function getClientUrls() {
  const urls =
    process.env.CLIENT_URLS ||
    process.env.CLIENT_URL ||
    "http://localhost:5173,http://localhost:5174";
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
