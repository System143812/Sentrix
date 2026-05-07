import cookieParser from "cookie-parser";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import router from "./routes/main.route.js";
import { notFound, errorHandler } from "./middlewares/error.middleware.js";

function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());

  const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";
  app.use(
    cors({
      origin: clientUrl,
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
