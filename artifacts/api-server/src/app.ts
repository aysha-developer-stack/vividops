import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Express } from "express";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { attachSession } from "./middlewares/session";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
const allowedOrigins = [
  "https://vividops.com.au",
  "https://www.vividops.com.au",
  process.env.FRONTEND_URL
].filter(Boolean) as string[];

app.use(cors({ 
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  }, 
  credentials: true 
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Health check must be ABOVE session middleware to avoid DB bottlenecks during startup
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use(attachSession);

app.use("/api", router);

// Serve static frontend files in production
if (process.env.NODE_ENV === "production") {
  const frontendPath = path.resolve(__dirname, "../../jms-landing/dist/public");
  app.use(express.static(frontendPath));
  
  // Handle SPA routing
  app.get("*", (req, res, next) => {
    if (req.url.startsWith("/api")) return next();
    res.sendFile(path.join(frontendPath, "index.html"));
  });
}

app.get("/", (req, res) => {
  res.json({ status: "ok", message: "Job Flow Manager API" });
});

// Error handling
app.use((err: any, req: any, res: any, next: any) => {
  logger.error({ err, url: req.url, method: req.method }, "Unhandled error");
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: "Internal Server Error",
  });
});

export default app;
