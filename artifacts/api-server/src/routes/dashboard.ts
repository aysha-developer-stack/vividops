import { Router } from "express";
import { db, users, jobs, jobMembers, timeLogs, errorReports, sql, desc, eq, and, lt, ne, inArray, gte, lte } from "@workspace/db";
import { logger } from "../lib/logger";
import { requireAuth } from "../middlewares/requireAuth";
import { ensureLegacySupervisorAssignments } from "../lib/schema-init";
import { getPresenceStatus } from "../lib/presence";

const router = Router();

router.get("/dashboard/stats", requireAuth, async (req, res) => {
  try {
    const actor = req.session!.user;
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekEnd = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    // For supervisor, only show stats for their jobs
    // For user (worker), only show stats for jobs assigned to them
    const isSupervisor = actor.role === "supervisor";
    const isWorker = actor.role === "user";
    
    if (isSupervisor) {
      await ensureLegacySupervisorAssignments();
    }

    const jobFilter = isSupervisor 
      ? eq(jobs.supervisorId, actor.id)
      : isWorker
      ? eq(jobs.assigneeId, actor.id)
      : undefined;

    const totalUsersPromise = (isSupervisor || isWorker)
      ? (async () => {
          // Supervisors/Workers only see users they collaborate with
          const filter = isSupervisor 
            ? eq(jobs.supervisorId, actor.id)
            : eq(jobs.assigneeId, actor.id);
            
          const scopedJobs = await db
            .select({ id: jobs.id, assigneeId: jobs.assigneeId })
            .from(jobs)
            .where(filter);
          const jobIds = scopedJobs.map((job) => job.id);
          const visibleIds = new Set(
            scopedJobs
              .map((job) => job.assigneeId)
              .filter((id): id is string => typeof id === "string" && id.length > 0),
          );
          if (jobIds.length > 0) {
            const members = await db
              .select({ userId: jobMembers.userId })
              .from(jobMembers)
              .where(inArray(jobMembers.jobId, jobIds));
            for (const member of members) visibleIds.add(member.userId);
          }
          return [{ count: visibleIds.size }];
        })()
      : db.select({ count: sql<number>`count(*)` }).from(users);

    const [totalUsers, jobCounts, recentJobs, userMetrics] = await Promise.all([
      totalUsersPromise,
      db
        .select({
          totalJobs: sql<number>`count(*)`,
          activeJobs: sql<number>`count(*) filter (where ${jobs.status} = 'in_progress')`,
          overdueJobs: sql<number>`count(*) filter (where ${jobs.status} <> 'completed' and ${jobs.dueDate} < now())`,
          dueToday: sql<number>`count(*) filter (where ${jobs.dueDate} >= ${todayStart} and ${jobs.dueDate} < ${new Date(todayStart.getTime() + 24 * 60 * 60 * 1000)})`,
          dueThisWeek: sql<number>`count(*) filter (where ${jobs.dueDate} >= ${todayStart} and ${jobs.dueDate} < ${weekEnd})`,
          waitingReview: sql<number>`count(*) filter (where ${jobs.status} = 'in_progress' and ${jobs.progress} >= 90)`,
          reworkRequired: sql<number>`count(*) filter (where ${jobs.status} = 'rework')`,
        })
        .from(jobs)
        .where(jobFilter),
      db.select()
        .from(jobs)
        .where(jobFilter)
        .orderBy(desc(jobs.updatedAt))
        .limit(5),
      (async () => {
        if (isSupervisor || isWorker) return null;
        
        const [currentlyWorking] = await db.select({ count: sql<number>`count(distinct ${timeLogs.userId})` }).from(timeLogs).where(sql`${timeLogs.createdAt} >= ${todayStart} and ${timeLogs.duration} = 0`);
        const [usersMostErrors] = await db.select({ name: users.name, count: sql<number>`count(*)` }).from(errorReports).innerJoin(users, eq(users.id, errorReports.userId)).groupBy(users.name).orderBy(desc(sql`count(*)`)).limit(1);
        const [usersMostRework] = await db.select({ name: users.name, count: sql<number>`count(*)` }).from(jobs).innerJoin(users, eq(users.id, jobs.assigneeId)).where(eq(jobs.status, "rework")).groupBy(users.name).orderBy(desc(sql`count(*)`)).limit(1);
        
        return {
          currentlyWorking: Number(currentlyWorking.count),
          usersMostErrors: usersMostErrors?.name ?? "None",
          usersMostRework: usersMostRework?.name ?? "None",
        };
      })(),
    ]);

    return res.json({
      stats: {
        totalUsers: Number(totalUsers[0].count),
        totalJobs: Number(jobCounts[0].totalJobs),
        activeJobs: Number(jobCounts[0].activeJobs),
        overdueJobs: Number(jobCounts[0].overdueJobs),
        dueToday: Number(jobCounts[0].dueToday),
        dueThisWeek: Number(jobCounts[0].dueThisWeek),
        waitingReview: Number(jobCounts[0].waitingReview),
        reworkRequired: Number(jobCounts[0].reworkRequired),
        ...userMetrics,
      },
      recentJobs,
    });
  } catch (err) {
    logger.error({ err }, "Failed to fetch dashboard stats");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/dashboard/supervisor", requireAuth, async (req, res) => {
  try {
    const actor = req.session!.user;
    if (actor.role !== "supervisor" && actor.role !== "admin" && actor.role !== "super-admin") {
      return res.status(403).json({ error: "Forbidden" });
    }

    await ensureLegacySupervisorAssignments();

    const supervisorId = actor.id;
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekEnd = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000);

    const supervisedJobs = await db
      .select()
      .from(jobs)
      .where(eq(jobs.supervisorId, supervisorId));
    const supervisedJobIds = supervisedJobs.map((job) => job.id);

    // 1. Get stats
    const [statsResult] = await db
      .select({
        totalJobs: sql<number>`count(*)`,
        activeJobs: sql<number>`count(*) filter (where ${jobs.status} = 'in_progress')`,
        overdueJobs: sql<number>`count(*) filter (where ${jobs.status} <> 'completed' and ${jobs.dueDate} < now())`,
        pendingReworkTasks: sql<number>`count(*) filter (where ${jobs.status} = 'rework')`,
        dueToday: sql<number>`count(*) filter (where ${jobs.dueDate} >= ${todayStart} and ${jobs.dueDate} < ${new Date(todayStart.getTime() + 24 * 60 * 60 * 1000)})`,
        dueThisWeek: sql<number>`count(*) filter (where ${jobs.dueDate} >= ${todayStart} and ${jobs.dueDate} < ${weekEnd})`,
        waitingReview: sql<number>`count(*) filter (where ${jobs.status} = 'in_progress' and ${jobs.progress} >= 90)`,
      })
      .from(jobs)
      .where(eq(jobs.supervisorId, supervisorId));

    // 2. Get team members (main assignees + additional workers on supervised jobs)
    const memberRows = supervisedJobIds.length > 0
      ? await db
          .select({ jobId: jobMembers.jobId, userId: jobMembers.userId })
          .from(jobMembers)
          .where(inArray(jobMembers.jobId, supervisedJobIds))
      : [];

    const membershipByUserId = new Map<string, Set<string>>();
    for (const member of memberRows) {
      const current = membershipByUserId.get(member.userId) ?? new Set<string>();
      current.add(member.jobId);
      membershipByUserId.set(member.userId, current);
    }

    const teamIds = [
      ...new Set(
        [
          ...supervisedJobs
            .map((job) => job.assigneeId)
            .filter((id): id is string => typeof id === "string" && id.length > 0),
          ...memberRows.map((row) => row.userId),
        ],
      ),
    ];
    
    let teamData: any[] = [];
    if (teamIds.length > 0) {
      const teamUsers = await db
        .select()
        .from(users)
        .where(inArray(users.id, teamIds));
      const todayLogs = await db.select()
        .from(timeLogs)
        .where(
          and(
            inArray(timeLogs.userId, teamIds),
            supervisedJobIds.length > 0 ? inArray(timeLogs.jobId, supervisedJobIds) : sql`false`,
            sql`${timeLogs.createdAt} >= ${todayStart}`,
          ),
        );

      teamData = teamUsers.map(u => {
        const uLogs = todayLogs.filter(l => l.userId === u.id);
        const uJobs = supervisedJobs.filter(
          (job) =>
            job.assigneeId === u.id ||
            membershipByUserId.get(u.id)?.has(job.id) === true,
        );
        const hours = uLogs.reduce((sum, l) => sum + (l.duration / 3600), 0);
        const completedCount = uJobs.filter((job) => job.status === "completed").length;
        const reworkCount = uJobs.filter((job) => job.status === "rework").length;
        const efficiency =
          uJobs.length > 0
            ? Math.max(0, Math.min(100, Math.round((completedCount / uJobs.length) * 100 - reworkCount * 10)))
            : 0;

        return {
          id: u.id,
          name: u.name,
          avatar: u.name.split(" ").map(s => s[0]).join("").toUpperCase(),
          jobsToday: uJobs.filter((job) => job.status === "in_progress" || job.status === "rework").length,
          hoursToday: Number(hours.toFixed(1)),
          efficiency: efficiency,
          status: getPresenceStatus({
            accountStatus: u.status,
            lastSeenAt: u.lastSeenAt,
            lastSignInAt: u.lastSignInAt,
          }),
        };
      });
    }

    // 3. Get active jobs
    const activeJobsList = await db.select()
      .from(jobs)
      .where(and(
        eq(jobs.supervisorId, supervisorId),
        eq(jobs.status, "in_progress")
      ))
      .orderBy(desc(jobs.updatedAt))
      .limit(5);

    // 4. Get overdue jobs
    const overdueJobsList = await db.select({
      id: sql<string>`'JOB-' || ${jobs.serial}::text`,
      title: jobs.title,
      dueDate: jobs.dueDate,
      assigneeId: jobs.assigneeId
    })
      .from(jobs)
      .where(and(
        eq(jobs.supervisorId, supervisorId),
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

    const activeTimers = new Set(
      teamData
        .filter((member) => member.hoursToday > 0 && member.status === "online")
        .map((member) => member.id),
    ).size;

    return res.json({
      stats: {
        activeJobs: Number(statsResult.activeJobs),
        teamSize: teamIds.length,
        totalJobs: Number(statsResult.totalJobs),
        overdueJobs: Number(statsResult.overdueJobs),
        pendingReworkTasks: Number(statsResult.pendingReworkTasks),
        activeTimers,
      },
      activeJobs: activeJobsList,
      team: teamData,
      overdue: overdueWithAssignees
    });
  } catch (err) {
    logger.error({ err }, "Failed to fetch supervisor dashboard");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
