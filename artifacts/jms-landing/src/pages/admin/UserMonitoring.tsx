import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Search, Activity } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { useDashboardSearch } from "@/lib/pageSearch";
import LiveSupervisorReviewPanel from "@/components/LiveSupervisorReviewPanel";
import Pagination, { usePagination } from "@/components/Pagination";
import {
  useListUsers,
  useListJobs,
  useGetTimeLogs,
  type User,
  type Job,
} from "@workspace/api-client-react";
import type { Role } from "@/lib/roles";
import { formatDurationSeconds } from "@/lib/jobMappers";
import { getPresenceStatus } from "@/lib/presence";
import {
  fetchActiveTimerSessions,
  liveSessionElapsedSeconds,
  type ActiveTimerSession,
} from "@/lib/timerSessionApi";

interface Worker {
  id: string;
  name: string;
  avatar: string;
  secondsToday: number;
  secondsWeek: number;
  jobsCompleted: number;
  reworks: number;
  mistakes: number;
  efficiency: number;
  status: "active" | "idle" | "offline" | "on_job";
  currentJobId: string | null;
  currentJobLabel: string | null;
  lastJobId: string | null;
  lastJobLabel: string | null;
}

function formatJobDisplay(number: string | null | undefined, title: string | null | undefined): string | null {
  const normalizedNumber = number
    ? number.startsWith("JOB-")
      ? number
      : `JOB-${number.replace(/^JOB-/i, "")}`
    : null;
  if (normalizedNumber && title) return `${normalizedNumber} · ${title}`;
  return normalizedNumber ?? title ?? null;
}

function parseMs(iso: string | null | undefined) {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function getLatestJob(jobs: Job[]): Job | null {
  return [...jobs].sort((a, b) => {
    const aMs = parseMs(a.completedAt) ?? parseMs(a.updatedAt) ?? parseMs(a.createdAt) ?? 0;
    const bMs = parseMs(b.completedAt) ?? parseMs(b.updatedAt) ?? parseMs(b.createdAt) ?? 0;
    return bMs - aMs;
  })[0] ?? null;
}

function getWorkerStatus(user: User, activeSession?: ActiveTimerSession | null): Worker["status"] {
  if (activeSession?.isLive) return "on_job";
  const presence = getPresenceStatus({
    accountStatus: user.status,
    lastSeenAt: user.lastSeenAt,
    lastSignInAt: user.lastSignInAt,
  });
  if (presence === "online") return "active";
  if (presence === "away") return "idle";
  return "offline";
}

function getPerformanceScore(jobs: Job[]) {
  if (!jobs.length) return 0;
  const completedJobs = jobs.filter((job) => job.status === "completed");
  const completedCount = completedJobs.length;
  const onTimeCount = completedJobs.reduce((acc, job) => {
    const completedMs = parseMs(job.completedAt);
    const dueMs = parseMs(job.dueDate);
    if (completedMs != null && dueMs != null && completedMs <= dueMs) return acc + 1;
    return acc;
  }, 0);
  const reworkCount = jobs.filter((job) => job.status === "rework").length;
  const completionRate = completedCount / jobs.length;
  const onTimeRate = completedCount > 0 ? onTimeCount / completedCount : 0;
  const reworkRate = reworkCount / jobs.length;
  const score = completionRate * 60 + onTimeRate * 25 + (1 - clamp(reworkRate, 0, 1)) * 15;
  return Math.round(clamp(score, 0, 100));
}

export default function UserMonitoring({ role = "super-admin" }: { role?: Role } = {}) {
  const { data: apiUsers, isLoading: usersLoading } = useListUsers({
    query: { refetchInterval: 30_000 } as any,
  });
  const { data: apiJobs, isLoading: jobsLoading } = useListJobs();
  const { data: apiTimeLogs, isLoading: logsLoading } = useGetTimeLogs();

  const { search, setSearch, headerSearch } = useDashboardSearch("Search users…");
  const [jobMemberships, setJobMemberships] = useState<Record<string, string[]>>({});
  const [activeSessions, setActiveSessions] = useState<ActiveTimerSession[]>([]);
  const [liveTick, setLiveTick] = useState(0);
  const [mistakeCounts, setMistakeCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/mistakes/analytics?period=30d", { credentials: "include" });
        if (!res.ok) return;
        const data = (await res.json()) as { byUser?: Array<{ userId: string; count: number }> };
        if (!cancelled && data.byUser) {
          setMistakeCounts(Object.fromEntries(data.byUser.map((u) => [u.userId, u.count])));
        }
      } catch {
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const rows = await fetchActiveTimerSessions();
      if (!cancelled) setActiveSessions(rows);
    };
    void load();
    const id = window.setInterval(load, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setLiveTick((t) => t + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const jobs = apiJobs ?? [];
    if (jobs.length === 0) {
      setJobMemberships({});
      return () => { cancelled = true; };
    }

    (async () => {
      try {
        const entries = await Promise.all(
          jobs.map(async (job) => {
            const fromApi = (job.assignees ?? [])
              .filter((member) => member?.role === "user" && typeof member.id === "string")
              .map((member) => member.id);
            if (fromApi.length > 0) return [job.id, fromApi] as const;

            const res = await fetch(`/api/jobs/${job.id}/members`, { credentials: "include" });
            if (!res.ok) {
              const fallback = job.assignee?.role === "user" && job.assignee.id ? [job.assignee.id] : [];
              return [job.id, fallback] as const;
            }
            const data = (await res.json()) as Array<{ id: string; role: string }>;
            const userIds = Array.isArray(data)
              ? data.filter((m) => m?.role === "user").map((m) => m.id)
              : [];
            if (userIds.length === 0 && job.assignee?.role === "user" && job.assignee.id) {
              return [job.id, [job.assignee.id]] as const;
            }
            return [job.id, userIds] as const;
          }),
        );
        if (!cancelled) setJobMemberships(Object.fromEntries(entries));
      } catch {
        if (!cancelled) setJobMemberships({});
      }
    })();

    return () => { cancelled = true; };
  }, [apiJobs]);

  const workers: Worker[] = useMemo(() => {
    const now = new Date();
    const startOfTodayMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const dayOffset = (now.getDay() + 6) % 7;
    const startOfWeekMs = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOffset).getTime();
    const scoreWindowMs = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const sessionByUser = new Map(activeSessions.map((s) => [s.userId, s]));

    return (apiUsers ?? [])
      .filter((u: User) => u.role === "user")
      .map((u: User) => {
        const userJobs = (apiJobs ?? []).filter(
          (job) => job.assignee?.id === u.id || (jobMemberships[job.id] ?? []).includes(u.id),
        );
        const userLogs = (apiTimeLogs ?? []).filter((log) => log.userId === u.id);
        const activeSession = sessionByUser.get(u.id) ?? null;
        const activeSeconds = activeSession ? liveSessionElapsedSeconds(activeSession) : 0;

        const secondsToday =
          userLogs
            .filter((log) => {
              const createdMs = parseMs(log.createdAt);
              return createdMs != null && createdMs >= startOfTodayMs;
            })
            .reduce((sum, log) => sum + (log.duration ?? 0), 0) + activeSeconds;

        const secondsWeek =
          userLogs
            .filter((log) => {
              const createdMs = parseMs(log.createdAt);
              return createdMs != null && createdMs >= startOfWeekMs;
            })
            .reduce((sum, log) => sum + (log.duration ?? 0), 0) + activeSeconds;

        const scoreJobs = userJobs.filter((job) => {
          const createdMs = parseMs(job.createdAt);
          const updatedMs = parseMs(job.updatedAt);
          const completedMs = parseMs(job.completedAt);
          const dueMs = parseMs(job.dueDate);
          return (
            (createdMs != null && createdMs >= scoreWindowMs) ||
            (updatedMs != null && updatedMs >= scoreWindowMs) ||
            (completedMs != null && completedMs >= scoreWindowMs) ||
            (dueMs != null && dueMs >= scoreWindowMs)
          );
        });

        const latestJob = getLatestJob(userJobs);
        const lastJobLabel = latestJob ? formatJobDisplay(latestJob.number, latestJob.title) : null;
        const currentJobLabel =
          activeSession?.isLive && (activeSession.jobNumber || activeSession.jobTitle)
            ? formatJobDisplay(activeSession.jobNumber, activeSession.jobTitle)
            : null;

        return {
          id: u.id,
          name: u.name,
          avatar: u.name.split(" ").map((s) => s[0]).join("").toUpperCase().slice(0, 2),
          secondsToday,
          secondsWeek,
          jobsCompleted: userJobs.filter((job) => job.status === "completed").length,
          reworks: userJobs.filter((job) => job.status === "rework").length,
          mistakes: mistakeCounts[u.id] ?? 0,
          efficiency: getPerformanceScore(scoreJobs),
          status: getWorkerStatus(u, activeSession),
          currentJobId: activeSession?.isLive ? activeSession.jobId ?? null : null,
          currentJobLabel,
          lastJobId: latestJob?.id ?? null,
          lastJobLabel,
        };
      });
  }, [apiJobs, apiTimeLogs, apiUsers, jobMemberships, activeSessions, liveTick, mistakeCounts]);

  const filtered = workers.filter((w) => w.name.toLowerCase().includes(search.toLowerCase()));
  const workersP = usePagination(filtered, 6);

  const isLoading = usersLoading || jobsLoading || logsLoading;
  const anyData = apiUsers || apiJobs || apiTimeLogs;

  if (isLoading && !anyData) {
    return (
      <DashboardLayout title="User Monitoring" role={role} headerSearch={headerSearch}>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </DashboardLayout>
    );
  }

  const jobBase =
    role === "super-admin" ? "/super-admin/jobs"
    : role === "admin" ? "/admin/jobs"
    : "/supervisor/jobs";

  return (
    <DashboardLayout title="User Monitoring" role={role} headerSearch={headerSearch}>
      {(role === "admin" || role === "super-admin") && <LiveSupervisorReviewPanel role={role} />}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <Activity size={16} className="text-primary" />
          Team performance
        </div>
        {(role === "admin" || role === "super-admin") && (
          <Link
            href={role === "super-admin" ? "/super-admin/supervisors" : "/admin/supervisors"}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold border border-gray-200 bg-white text-gray-700 hover:border-primary hover:text-primary transition-colors"
          >
            Supervisor oversight
          </Link>
        )}
      </div>

      <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-2.5 max-w-md mb-5 focus-within:border-primary transition-colors">
        <Search size={16} className="text-gray-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search team members…"
          className="bg-transparent text-gray-900 placeholder:text-gray-400 text-sm flex-1 focus:outline-none"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {workersP.pageItems.map((w, i) => (
          <motion.div
            key={w.id}
            layout
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            whileHover={{ y: -4, boxShadow: "0 14px 28px rgba(0,0,0,0.07)" }}
            className="bg-white rounded-2xl border border-gray-100 p-5"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="relative">
                <div className="w-11 h-11 rounded-full bg-gradient-to-br from-primary to-sky-700 text-white text-sm font-bold flex items-center justify-center">
                  {w.avatar}
                </div>
                <span
                  className={`absolute bottom-0 right-0 w-3 h-3 rounded-full ring-2 ring-white ${
                    w.status === "on_job"
                      ? "bg-sky-400 animate-pulse"
                      : w.status === "active"
                        ? "bg-emerald-400"
                        : w.status === "idle"
                          ? "bg-amber-400"
                          : "bg-gray-400"
                  }`}
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm text-gray-900 truncate">{w.name}</div>
                <div className="text-[10px] text-gray-500">
                  {w.status === "on_job"
                    ? "On job"
                    : w.status === "active"
                      ? "Online"
                      : w.status === "idle"
                        ? "Away"
                        : "Offline"}
                </div>
                {w.currentJobLabel ? (
                  <div className="text-[10px] mt-0.5 truncate" title={w.currentJobLabel}>
                    <span className="text-gray-500">Working on: </span>
                    {w.currentJobId ? (
                      <Link
                        href={`${jobBase}/${w.currentJobId}`}
                        className="text-sky-700 font-medium hover:underline"
                      >
                        {w.currentJobLabel}
                      </Link>
                    ) : (
                      <span className="text-sky-700 font-medium">{w.currentJobLabel}</span>
                    )}
                  </div>
                ) : w.lastJobLabel ? (
                  <div className="text-[10px] mt-0.5 truncate" title={w.lastJobLabel}>
                    <span className="text-gray-500">Last job: </span>
                    {w.lastJobId ? (
                      <Link
                        href={`${jobBase}/${w.lastJobId}`}
                        className="text-gray-700 font-medium hover:underline"
                      >
                        {w.lastJobLabel}
                      </Link>
                    ) : (
                      <span className="text-gray-700 font-medium">{w.lastJobLabel}</span>
                    )}
                  </div>
                ) : null}
              </div>
              <div
                className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                  w.efficiency >= 90
                    ? "bg-emerald-50 text-emerald-700"
                    : w.efficiency >= 80
                      ? "bg-amber-50 text-amber-700"
                      : "bg-red-50 text-red-700"
                }`}
              >
                {w.efficiency}%
              </div>
            </div>

            <div className="mb-3">
              <div className="flex justify-between text-[10px] text-gray-500 mb-1">
                <span>Today</span>
                <span className="font-bold">{formatDurationSeconds(w.secondsToday)} / 8h</span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min((w.secondsToday / (8 * 3600)) * 100, 100)}%` }}
                  transition={{ duration: 0.6 + i * 0.04 }}
                  className="h-full bg-primary rounded-full"
                />
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2 pt-3 border-t border-gray-100">
              <div className="text-center">
                <div className="text-sm font-bold text-gray-900">{formatDurationSeconds(w.secondsWeek)}</div>
                <div className="text-[9px] text-gray-500 uppercase tracking-wide">Week</div>
              </div>
              <div className="text-center">
                <div className="text-base font-bold text-emerald-600">{w.jobsCompleted}</div>
                <div className="text-[9px] text-gray-500 uppercase tracking-wide">Done</div>
              </div>
              <div className="text-center">
                <div className={`text-base font-bold ${w.reworks > 0 ? "text-amber-600" : "text-gray-300"}`}>
                  {w.reworks}
                </div>
                <div className="text-[9px] text-gray-500 uppercase tracking-wide">Rework</div>
              </div>
              <div className="text-center">
                <div className={`text-base font-bold ${w.mistakes > 0 ? "text-red-600" : "text-gray-300"}`}>
                  {w.mistakes}
                </div>
                <div className="text-[9px] text-gray-500 uppercase tracking-wide">Mistakes</div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="mt-4 bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <Pagination
          page={workersP.page}
          totalPages={workersP.totalPages}
          total={workersP.total}
          pageSize={workersP.pageSize}
          onChange={workersP.setPage}
          label="team members"
        />
      </div>
    </DashboardLayout>
  );
}
