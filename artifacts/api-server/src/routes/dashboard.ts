import { Router } from "express";
import { db, users, jobs, timeLogs, sql, desc, eq, and, or, lt, ne, inArray } from "@workspace/db";
import { logger } from "../lib/logger";
import { requireAuth } from "../middlewares/requireAuth";
import { publicUser } from "../lib/serialize";

const router = Router();

router.get("/dashboard/stats", requireAuth, async (req, res) => {
  try {
    const actor = req.session!.user;
    
    // For supervisor, only show stats for their jobs
    const isSupervisor = actor.role === "supervisor";
    const jobFilter = isSupervisor 
      ? or(eq(jobs.supervisorId, actor.id), eq(jobs.createdById, actor.id))
      : undefined;

    const [totalUsers, jobCounts, recentJobs] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(users),
      db
        .select({
          totalJobs: sql<number>`count(*)`,
          activeJobs: sql<number>`count(*) filter (where ${jobs.status} = 'in_progress')`,
          overdueJobs: sql<number>`count(*) filter (where ${jobs.status} <> 'completed' and ${jobs.dueDate} < now())`,
        })
        .from(jobs)
        .where(jobFilter),
      db.select()
        .from(jobs)
        .where(jobFilter)
        .orderBy(desc(jobs.updatedAt))
        .limit(5),
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

router.get("/dashboard/supervisor", requireAuth, async (req, res) => {
  try {
    const actor = req.session!.user;
    if (actor.role !== "supervisor" && actor.role !== "admin" && actor.role !== "super-admin") {
      return res.status(403).json({ error: "Forbidden" });
    }

    const supervisorId = actor.id;
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // 1. Get stats
    const [statsResult] = await db
      .select({
        totalJobs: sql<number>`count(*)`,
        activeJobs: sql<number>`count(*) filter (where ${jobs.status} = 'in_progress')`,
        overdueJobs: sql<number>`count(*) filter (where ${jobs.status} <> 'completed' and ${jobs.dueDate} < now())`,
      })
      .from(jobs)
      .where(or(eq(jobs.supervisorId, supervisorId), eq(jobs.createdById, supervisorId)));

    // 2. Get team members (workers on supervisor's jobs)
    const teamMembersJobs = await db
      .select({ assigneeId: jobs.assigneeId })
      .from(jobs)
      .where(or(eq(jobs.supervisorId, supervisorId), eq(jobs.createdById, supervisorId)));
    
    const teamIds = [...new Set(teamMembersJobs.map(j => j.assigneeId).filter((id): id is string => !!id))];
    
    let teamData: any[] = [];
    if (teamIds.length > 0) {
      const teamUsers = await db.select().from(users).where(inArray(users.id, teamIds));
      const todayLogs = await db.select()
        .from(timeLogs)
        .where(and(inArray(timeLogs.userId, teamIds), sql`${timeLogs.createdAt} >= ${todayStart}`));
      const todayJobs = await db.select()
        .from(jobs)
        .where(and(inArray(jobs.assigneeId, teamIds), sql`${jobs.createdAt} >= ${todayStart}`));

      teamData = teamUsers.map(u => {
        const uLogs = todayLogs.filter(l => l.userId === u.id);
        const uJobs = todayJobs.filter(j => j.assigneeId === u.id);
        const hours = uLogs.reduce((sum, l) => sum + (l.duration / 3600), 0);
        
        return {
          name: u.name,
          avatar: u.name.split(" ").map(s => s[0]).join("").toUpperCase(),
          jobsToday: uJobs.length,
          hoursToday: Number(hours.toFixed(1)),
          status: u.status === "active" ? "online" : "offline"
        };
      });
    }

    // 3. Get active jobs
    const activeJobsList = await db.select()
      .from(jobs)
      .where(and(
        or(eq(jobs.supervisorId, supervisorId), eq(jobs.createdById, supervisorId)),
        eq(jobs.status, "in_progress")
      ))
      .orderBy(desc(jobs.updatedAt))
      .limit(5);

    // 4. Get overdue jobs
    const overdueJobsList = await db.select({
      id: jobs.number,
      title: jobs.title,
      dueDate: jobs.dueDate,
      assigneeId: jobs.assigneeId
    })
      .from(jobs)
      .where(and(
        or(eq(jobs.supervisorId, supervisorId), eq(jobs.createdById, supervisorId)),
        ne(jobs.status, "completed"),
        lt(jobs.dueDate, now)
      ))
      .orderBy(desc(jobs.dueDate))
      .limit(4);

    const overdueWithAssignees = await Promise.all(overdueJobsList.map(async (j) => {
      let assigneeName = "Unassigned";
      if (j.assigneeId) {
        const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, j.assigneeId));
        if (u) assigneeName = u.name;
      }
      const due = j.dueDate ? new Date(j.dueDate) : new Date();
      const diff = Math.max(0, Math.floor((new Date().getTime() - due.getTime()) / (1000 * 60 * 60 * 24)));
      
      return {
        id: j.id,
        title: j.title,
        days: diff,
        assignee: assigneeName
      };
    }));

    res.json({
      stats: {
        activeJobs: Number(statsResult.activeJobs),
        teamSize: teamIds.length,
        totalJobs: Number(statsResult.totalJobs),
        overdueJobs: Number(statsResult.overdueJobs),
      },
      activeJobs: activeJobsList,
      team: teamData,
      overdue: overdueWithAssignees
    });
  } catch (err) {
    logger.error({ err }, "Failed to fetch supervisor dashboard");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
