import { Router, type IRouter } from "express";
import { db, sql } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/requireAuth";
import { logger } from "../lib/logger";
import { ensureJobWriteSchema } from "../lib/schema-init";

const router: IRouter = Router();

const REPORT_TIMEZONE = process.env.REPORT_DISPLAY_TIMEZONE || "Asia/Karachi";

function parseDateParam(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  return trimmed;
}

function todayInTimezone(timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
}

function shiftDateString(dateStr: string, days: number): string {
  const base = new Date(`${dateStr}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

type DailyRow = {
  user_id: string;
  user_name: string;
  user_role: string;
  work_date: string;
  total_seconds: number;
  session_count: number;
  job_count: number;
};

router.get(
  "/reports/daily-time",
  requireAuth,
  requireRole("admin", "super-admin"),
  async (req, res) => {
    try {
      await ensureJobWriteSchema();

      const today = todayInTimezone(REPORT_TIMEZONE);
      const from =
        parseDateParam(req.query.from) ?? shiftDateString(today, -30);
      const to = parseDateParam(req.query.to) ?? today;

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
          (tl.created_at AT TIME ZONE ${REPORT_TIMEZONE})::date AS work_date,
          SUM(tl.duration)::int AS total_seconds,
          COUNT(*)::int AS session_count,
          COUNT(DISTINCT tl.job_id) FILTER (WHERE tl.job_id IS NOT NULL)::int AS job_count
        FROM time_logs tl
        INNER JOIN users u ON u.id = tl.user_id
        WHERE u.role IN ('user', 'supervisor')
          AND (tl.created_at AT TIME ZONE ${REPORT_TIMEZONE})::date >= ${from}::date
          AND (tl.created_at AT TIME ZONE ${REPORT_TIMEZONE})::date <= ${to}::date
          ${userId ? sql`AND tl.user_id = ${userId}` : sql``}
        GROUP BY tl.user_id, u.name, u.role, work_date
        ORDER BY work_date DESC, u.name ASC
      `);

      const rawRows = (
        (result as unknown as { rows?: DailyRow[] }).rows ?? []
      ) as DailyRow[];

      const rows = rawRows.map((row) => ({
        userId: row.user_id,
        userName: row.user_name,
        userRole: row.user_role,
        date:
          typeof row.work_date === "string"
            ? row.work_date.slice(0, 10)
            : new Date(row.work_date).toISOString().slice(0, 10),
        totalSeconds: Number(row.total_seconds) || 0,
        sessionCount: Number(row.session_count) || 0,
        jobCount: Number(row.job_count) || 0,
      }));

      const jobCountResult = await db.execute(sql`
        SELECT
          tl.user_id,
          COUNT(DISTINCT tl.job_id) FILTER (WHERE tl.job_id IS NOT NULL)::int AS job_count
        FROM time_logs tl
        INNER JOIN users u ON u.id = tl.user_id
        WHERE u.role IN ('user', 'supervisor')
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

export default router;
