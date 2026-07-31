import fs from "node:fs";
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
import { db, sql } from "@workspace/db";

function resolveFrontendPath(): string | null {
  const candidates = [
    path.resolve(__dirname, "../../jms-landing/dist/public"),
    path.resolve(process.cwd(), "artifacts/jms-landing/dist/public"),
    path.resolve(process.cwd(), "jms-landing/dist/public"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "index.html"))) return candidate;
  }
  return null;
}

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

app.use((req, res, next) => {
  const isApi = req.path.startsWith("/api/");
  const isHealth = req.path === "/api/health";
  const wantsHtml = !isApi && req.method === "GET";
  if ((req.session && !isHealth) || wantsHtml) {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
  }
  next();
});

app.use("/api", (req, res, next) => {
  const pathOnly = req.path || "";
  const shouldSkip =
    pathOnly === "/health" ||
    pathOnly === "/system/health" ||
    pathOnly === "/settings/system/metrics";

  if (!shouldSkip) {
    res.on("finish", () => {
      void (async () => {
        try {
          await db.execute(sql`
            INSERT INTO api_request_daily (day, count, updated_at)
            VALUES (current_date, 1, now())
            ON CONFLICT (day)
            DO UPDATE SET
              count = api_request_daily.count + 1,
              updated_at = now();
          `);
        } catch (err) {
          // Only log once every few minutes to avoid spamming if DB is down
          logger.warn({ path: pathOnly }, "Failed to record API request metric");
        }
      })();
    });
  }

  next();
});

app.use("/api", router);

// Serve the Vite SPA whenever the build output exists (do not rely on NODE_ENV —
// Railway/runtime may leave NODE_ENV unset, which previously made /login 404).
const frontendPath = resolveFrontendPath();
if (frontendPath) {
  logger.info({ frontendPath }, "Serving frontend SPA from disk");

  app.get("/robots.txt", (_req, res) => {
    res.sendFile(path.join(frontendPath, "robots.txt"));
  });

  app.get("/sitemap.xml", (_req, res) => {
    res.sendFile(path.join(frontendPath, "sitemap.xml"));
  });

  app.use(express.static(frontendPath, { index: false }));

  // Express 5–safe SPA fallback (client routes like /login, /user/jobs, …)
  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    if (req.path.startsWith("/api")) return next();
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.sendFile(path.join(frontendPath, "index.html"), (err) => {
      if (err) next(err);
    });
  });
} else {
  logger.warn(
    { nodeEnv: process.env.NODE_ENV ?? null },
    "Frontend dist not found; API-only mode (/login will 404 until jms-landing is built)",
  );
  app.get("/", (_req, res) => {
    res.json({ status: "ok", message: "Job Flow Manager API" });
  });
}

// Error handling
app.use((err: any, req: any, res: any, next: any) => {
  logger.error({ err, url: req.url, method: req.method }, "Unhandled error");
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: "Internal Server Error",
  });
});

export default app;
