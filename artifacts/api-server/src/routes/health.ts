import { Router, type IRouter } from "express";
import { db, sql } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { logger } from "../lib/logger";
import { supabase } from "../lib/storage";

const router: IRouter = Router();

type HealthStatus = "healthy" | "degraded" | "down";

type ServiceHealth = {
  id: string;
  name: string;
  status: HealthStatus;
  detail: string;
  latencyMs: number | null;
  checkedAt: string;
};

function envPresent(...keys: string[]) {
  return keys.every((k) => {
    const v = process.env[k];
    return typeof v === "string" && v.trim().length > 0;
  });
}

async function checkDatabase(): Promise<ServiceHealth> {
  const checkedAt = new Date().toISOString();
  const started = Date.now();
  try {
    await db.execute(sql`SELECT 1`);
    const latencyMs = Date.now() - started;
    return {
      id: "database",
      name: "Database",
      status: latencyMs > 1500 ? "degraded" : "healthy",
      detail: latencyMs > 1500 ? `Responding slowly (${latencyMs}ms)` : `Connected · ${latencyMs}ms`,
      latencyMs,
      checkedAt,
    };
  } catch (err) {
    logger.warn({ err }, "System health: database check failed");
    return {
      id: "database",
      name: "Database",
      status: "down",
      detail: err instanceof Error ? err.message : "Database unreachable",
      latencyMs: Date.now() - started,
      checkedAt,
    };
  }
}

async function checkFileStorage(): Promise<ServiceHealth> {
  const checkedAt = new Date().toISOString();
  const started = Date.now();
  const configured = envPresent("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY");
  if (!configured) {
    return {
      id: "file_storage",
      name: "File Storage",
      status: "down",
      detail: "Supabase storage is not configured",
      latencyMs: null,
      checkedAt,
    };
  }

  const bucketName = process.env.SUPABASE_STORAGE_BUCKET || "vivid-ops-files";
  try {
    const { data, error } = await supabase.storage.from(bucketName).list("", { limit: 1 });
    const latencyMs = Date.now() - started;
    if (error) {
      return {
        id: "file_storage",
        name: "File Storage",
        status: "down",
        detail: error.message || `Bucket "${bucketName}" unreachable`,
        latencyMs,
        checkedAt,
      };
    }

    let fileCount = 0;
    try {
      const [row] = await db
        .execute(sql`SELECT COUNT(*)::bigint AS count FROM job_attachments`)
        .then((r: any) => (r.rows ?? r) as Array<{ count?: string | number | bigint }>);
      fileCount = Number(row?.count ?? 0);
    } catch {
      fileCount = Array.isArray(data) ? data.length : 0;
    }

    return {
      id: "file_storage",
      name: "File Storage",
      status: latencyMs > 2000 ? "degraded" : "healthy",
      detail:
        latencyMs > 2000
          ? `Slow response · ${fileCount} job files tracked`
          : `Bucket ready · ${fileCount} job files tracked · ${latencyMs}ms`,
      latencyMs,
      checkedAt,
    };
  } catch (err) {
    logger.warn({ err }, "System health: file storage check failed");
    return {
      id: "file_storage",
      name: "File Storage",
      status: "down",
      detail: err instanceof Error ? err.message : "Storage check failed",
      latencyMs: Date.now() - started,
      checkedAt,
    };
  }
}

async function checkCliqSync(): Promise<ServiceHealth> {
  const checkedAt = new Date().toISOString();
  const started = Date.now();
  const configured =
    envPresent("ZOHO_CLIQ_WEBHOOK_URL") ||
    envPresent("ZOHO_CLIENT_ID", "ZOHO_CLIENT_SECRET", "ZOHO_CLIQ_REFRESH_TOKEN");

  if (!configured) {
    return {
      id: "cliq_sync",
      name: "Zoho Cliq Sync",
      status: "degraded",
      detail: "Cliq credentials are not fully configured",
      latencyMs: null,
      checkedAt,
    };
  }

  try {
    const rows = await db
      .execute(sql`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status = 'active')::int AS active,
          COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
          COUNT(*) FILTER (WHERE status = 'provisioning')::int AS provisioning
        FROM job_cliq_channels
      `)
      .then((r: any) => (r.rows ?? r) as Array<{
        total?: number;
        active?: number;
        failed?: number;
        provisioning?: number;
      }>);

    const stats = rows[0] ?? {};
    const total = Number(stats.total ?? 0);
    const active = Number(stats.active ?? 0);
    const failed = Number(stats.failed ?? 0);
    const provisioning = Number(stats.provisioning ?? 0);
    const latencyMs = Date.now() - started;

    let status: HealthStatus = "healthy";
    let detail = `Configured · ${active} active channels`;
    if (failed > 0 && failed >= Math.max(1, Math.ceil(total * 0.25))) {
      status = "down";
      detail = `${failed} failed channel${failed === 1 ? "" : "s"} of ${total}`;
    } else if (failed > 0 || provisioning > 0) {
      status = "degraded";
      detail = `${active} active · ${failed} failed · ${provisioning} provisioning`;
    } else if (total === 0) {
      status = "healthy";
      detail = "Configured · no job channels yet";
    }

    return {
      id: "cliq_sync",
      name: "Zoho Cliq Sync",
      status,
      detail: `${detail} · ${latencyMs}ms`,
      latencyMs,
      checkedAt,
    };
  } catch (err) {
    logger.warn({ err }, "System health: Cliq check failed");
    return {
      id: "cliq_sync",
      name: "Zoho Cliq Sync",
      status: "degraded",
      detail: err instanceof Error ? err.message : "Could not read Cliq channel status",
      latencyMs: Date.now() - started,
      checkedAt,
    };
  }
}

async function checkApiServer(): Promise<ServiceHealth> {
  const checkedAt = new Date().toISOString();
  const started = Date.now();
  // Endpoint responding means API process is up; include process uptime.
  const uptimeSec = Math.floor(process.uptime());
  const uptimeLabel =
    uptimeSec >= 86400
      ? `${Math.floor(uptimeSec / 86400)}d up`
      : uptimeSec >= 3600
        ? `${Math.floor(uptimeSec / 3600)}h up`
        : `${Math.max(1, Math.floor(uptimeSec / 60))}m up`;
  return {
    id: "api_server",
    name: "API Server",
    status: "healthy",
    detail: `Online · ${uptimeLabel}`,
    latencyMs: Date.now() - started,
    checkedAt,
  };
}

router.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

router.get("/system/health", requireAuth, async (req, res) => {
  const role = req.session!.user.role;
  if (role !== "super-admin" && role !== "admin") {
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    const [apiServer, database, fileStorage, cliqSync] = await Promise.all([
      checkApiServer(),
      checkDatabase(),
      checkFileStorage(),
      checkCliqSync(),
    ]);

    const services = [apiServer, database, fileStorage, cliqSync];
    const hasDown = services.some((s) => s.status === "down");
    const hasDegraded = services.some((s) => s.status === "degraded");
    const overall: HealthStatus = hasDown ? "down" : hasDegraded ? "degraded" : "healthy";
    const summary =
      overall === "healthy"
        ? "All services operational"
        : overall === "degraded"
          ? "Some services need attention"
          : "One or more services are down";

    return res.json({
      overall,
      summary,
      checkedAt: new Date().toISOString(),
      services,
    });
  } catch (err) {
    logger.error({ err }, "Failed to run system health checks");
    return res.status(500).json({ error: "Failed to run system health checks" });
  }
});

export default router;
