import { Router, type IRouter } from "express";
import { db, sql } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/requireAuth";
import { logger } from "../lib/logger";
import { ensureJobWriteSchema } from "../lib/schema-init";
import {
  REPORT_TIMEZONE,
  formatWorkDate,
  resolveReportRange,
} from "../lib/report-dates";

const router: IRouter = Router();

type DailyRow = {
  user_id: string;
  user_name: string;
  user_role: string;
  work_date: string;
  total_seconds: number;
  session_count: number;
  job_count: number;
};

type TimeTrackingRow = {
  id: string;
  user_id: string;
  user_name: string;
  user_role: string;
  job_id: string | null;
  job_number: string | null;
  job_serial: number | null;
  job_title: string | null;
  task: string | null;
  duration: number;
  work_date: string;
};

type ReworkCountRow = {
  user_id: string;
  rework_origin: string | null;
  count: number;
};

function jobLabelFromRow(row: Pick<TimeTrackingRow, "job_id" | "job_number" | "job_serial" | "job_title">) {
  if (!row.job_id) return "General";
  const number = row.job_number?.trim()
    ? `JOB-${row.job_number.trim()}`
    : row.job_serial != null
      ? `JOB-${row.job_serial}`
      : "Job";
  const title = row.job_title?.trim();
  return title ? `${number} · ${title}` : number;
}

function parseReworkRange(req: { query: Record<string, unknown> }) {
  return resolveReportRange(req.query, REPORT_TIMEZONE);
}

router.get(
  "/reports/daily-time",
  requireAuth,
  requireRole("admin", "super-admin"),
  async (req, res) => {
    try {
      await ensureJobWriteSchema();

      const { from, to } = resolveReportRange(req.query, REPORT_TIMEZONE);

      if (from > to) {
        return res.status(400).json({ error: "from must be on or before to" });
      }

      const userId =
        typeof req.query.userId === "string" && req.query.userId.trim()
          ? req.query.userId.trim()
          : null;

      const result = await db.execute(sql`
        SELECT
          tl.user_id,
          u.name AS user_name,
          u.role AS user_role,
          to_char((tl.created_at AT TIME ZONE ${REPORT_TIMEZONE})::date, 'YYYY-MM-DD') AS work_date,
          SUM(tl.duration)::int AS total_seconds,
          COUNT(*)::int AS session_count,
          COUNT(DISTINCT tl.job_id) FILTER (WHERE tl.job_id IS NOT NULL)::int AS job_count
        FROM time_logs tl
        INNER JOIN users u ON u.id = tl.user_id
        WHERE u.role IN ('user', 'supervisor')
          AND tl.duration > 0
          AND (tl.created_at AT TIME ZONE ${REPORT_TIMEZONE})::date >= ${from}::date
          AND (tl.created_at AT TIME ZONE ${REPORT_TIMEZONE})::date <= ${to}::date
          ${userId ? sql`AND tl.user_id = ${userId}` : sql``}
        GROUP BY tl.user_id, u.name, u.role, work_date
        HAVING SUM(tl.duration) > 0
        ORDER BY work_date DESC, u.name ASC
      `);

      const rawRows = (
        (result as unknown as { rows?: DailyRow[] }).rows ?? []
      ) as DailyRow[];

      const rows = rawRows
        .map((row) => ({
          userId: row.user_id,
          userName: row.user_name,
          userRole: row.user_role,
          date: formatWorkDate(row.work_date),
          totalSeconds: Number(row.total_seconds) || 0,
          sessionCount: Number(row.session_count) || 0,
          jobCount: Number(row.job_count) || 0,
        }))
        .filter((row) => row.date && row.totalSeconds > 0);

      const jobCountResult = await db.execute(sql`
        SELECT
          tl.user_id,
          COUNT(DISTINCT tl.job_id) FILTER (WHERE tl.job_id IS NOT NULL)::int AS job_count
        FROM time_logs tl
        INNER JOIN users u ON u.id = tl.user_id
        WHERE u.role IN ('user', 'supervisor')
          AND tl.duration > 0
          AND (tl.created_at AT TIME ZONE ${REPORT_TIMEZONE})::date >= ${from}::date
          AND (tl.created_at AT TIME ZONE ${REPORT_TIMEZONE})::date <= ${to}::date
          ${userId ? sql`AND tl.user_id = ${userId}` : sql``}
        GROUP BY tl.user_id
      `);

      const jobCountByUser = new Map<string, number>();
      for (const row of (
        (jobCountResult as unknown as { rows?: Array<{ user_id: string; job_count: number }> }).rows ?? []
      )) {
        jobCountByUser.set(row.user_id, Number(row.job_count) || 0);
      }

      const totalsMap = new Map<
        string,
        {
          userId: string;
          userName: string;
          userRole: string;
          totalSeconds: number;
          daysWorked: number;
          sessionCount: number;
          jobCount: number;
        }
      >();

      for (const row of rows) {
        if (row.totalSeconds <= 0) continue;
        const existing = totalsMap.get(row.userId);
        if (!existing) {
          totalsMap.set(row.userId, {
            userId: row.userId,
            userName: row.userName,
            userRole: row.userRole,
            totalSeconds: row.totalSeconds,
            daysWorked: 1,
            sessionCount: row.sessionCount,
            jobCount: jobCountByUser.get(row.userId) ?? row.jobCount,
          });
          continue;
        }
        existing.totalSeconds += row.totalSeconds;
        existing.daysWorked += 1;
        existing.sessionCount += row.sessionCount;
      }

      const userTotals = [...totalsMap.values()].sort((a, b) =>
        a.userName.localeCompare(b.userName),
      );

      return res.json({
        timezone: REPORT_TIMEZONE,
        from,
        to,
        rows,
        userTotals,
      });
    } catch (err) {
      logger.error({ err }, "Failed to load daily time report");
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

router.get(
  "/reports/time-tracking",
  requireAuth,
  requireRole("admin", "super-admin"),
  async (req, res) => {
    try {
      await ensureJobWriteSchema();

      const { from, to } = resolveReportRange(req.query, REPORT_TIMEZONE);
      if (from > to) {
        return res.status(400).json({ error: "from must be on or before to" });
      }

      const result = await db.execute(sql`
        SELECT
          tl.id,
          tl.user_id,
          u.name AS user_name,
          u.role AS user_role,
          tl.job_id,
          j.job_number,
          j."serial" AS job_serial,
          j.title AS job_title,
          tl.task,
          tl.duration,
          to_char((tl.created_at AT TIME ZONE ${REPORT_TIMEZONE})::date, 'YYYY-MM-DD') AS work_date
        FROM time_logs tl
        INNER JOIN users u ON u.id = tl.user_id
        LEFT JOIN jobs j ON j.id = tl.job_id
        WHERE u.role IN ('user', 'supervisor')
          AND tl.duration > 0
          AND (tl.created_at AT TIME ZONE ${REPORT_TIMEZONE})::date >= ${from}::date
          AND (tl.created_at AT TIME ZONE ${REPORT_TIMEZONE})::date <= ${to}::date
        ORDER BY tl.created_at DESC
      `);

      const rawRows = (
        (result as unknown as { rows?: TimeTrackingRow[] }).rows ?? []
      ) as TimeTrackingRow[];

      const rows = rawRows
        .map((row) => ({
          id: row.id,
          userId: row.user_id,
          userName: row.user_name,
          userRole: row.user_role,
          jobId: row.job_id,
          project: jobLabelFromRow(row),
          task: row.task || "Time log",
          seconds: Number(row.duration) || 0,
          date: formatWorkDate(row.work_date),
        }))
        .filter((row) => row.date && row.seconds > 0);

      const uniqueWorkers = new Set(rows.map((row) => row.userId)).size;
      const totalSeconds = rows.reduce((sum, row) => sum + row.seconds, 0);

      return res.json({
        timezone: REPORT_TIMEZONE,
        from,
        to,
        totalSeconds,
        sessionCount: rows.length,
        uniqueWorkers,
        rows,
      });
    } catch (err) {
      logger.error({ err }, "Failed to load time tracking report");
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

router.get(
  "/reports/rework-counts",
  requireAuth,
  requireRole("admin", "super-admin"),
  async (req, res) => {
    try {
      await ensureJobWriteSchema();

      const { from, to } = parseReworkRange(req);
      if (from > to) {
        return res.status(400).json({ error: "from must be on or before to" });
      }

      const result = await db.execute(sql`
        SELECT
          jr.user_id,
          jr.rework_origin,
          COUNT(*)::int AS count
        FROM job_reworks jr
        WHERE (jr.created_at AT TIME ZONE ${REPORT_TIMEZONE})::date >= ${from}::date
          AND (jr.created_at AT TIME ZONE ${REPORT_TIMEZONE})::date <= ${to}::date
        GROUP BY jr.user_id, jr.rework_origin
      `);

      const rawRows = (
        (result as unknown as { rows?: ReworkCountRow[] }).rows ?? []
      ) as ReworkCountRow[];

      const byUser = new Map<
        string,
        { userId: string; internal: number; external: number; supervisor: number }
      >();

      const totals = { internal: 0, external: 0, supervisor: 0 };

      for (const row of rawRows) {
        const userId = row.user_id;
        const count = Number(row.count) || 0;
        if (!byUser.has(userId)) {
          byUser.set(userId, { userId, internal: 0, external: 0, supervisor: 0 });
        }
        const bucket = byUser.get(userId)!;
        if (row.rework_origin === "internal") {
          bucket.internal += count;
          totals.internal += count;
        } else if (row.rework_origin === "external") {
          bucket.external += count;
          totals.external += count;
        } else {
          bucket.supervisor += count;
          totals.supervisor += count;
        }
      }

      return res.json({
        timezone: REPORT_TIMEZONE,
        from,
        to,
        totals,
        byUser: [...byUser.values()],
      });
    } catch (err) {
      logger.error({ err }, "Failed to load rework counts report");
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

export default router;
