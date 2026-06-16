import { Router } from "express";
import { db, users, jobs, sql, desc } from "@workspace/db";
import { logger } from "../lib/logger";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

router.get("/dashboard/stats", requireAuth, async (req, res) => {
  try {
    const [totalUsers, jobCounts, recentJobs] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(users),
      db
        .select({
          totalJobs: sql<number>`count(*)`,
          activeJobs: sql<number>`count(*) filter (where ${jobs.status} = 'in_progress')`,
          overdueJobs: sql<number>`count(*) filter (where ${jobs.status} <> 'completed' and ${jobs.dueDate} < now())`,
        })
        .from(jobs),
      db.select().from(jobs).orderBy(desc(jobs.updatedAt)).limit(5),
    ]);

    res.json({
      stats: {
        totalUsers: Number(totalUsers[0].count),
        totalJobs: Number(jobCounts[0].totalJobs),
        activeJobs: Number(jobCounts[0].activeJobs),
        overdueJobs: Number(jobCounts[0].overdueJobs),
      },
      recentJobs,
    });
  } catch (err) {
    logger.error({ err }, "Failed to fetch dashboard stats");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
