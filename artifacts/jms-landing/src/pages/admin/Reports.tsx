import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Download, FileText, Users, AlertTriangle, Clock, TrendingUp,
  ChevronRight, Filter, Shield, UserCog, User as UserIcon, Crown,
  X, Check, Search, CheckCircle2, CalendarDays, Eye,
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import Pagination, { usePagination } from "@/components/Pagination";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Role } from "@/lib/roles";
import { isJobOverdueByDueDate, formatDurationSeconds } from "@/lib/jobMappers";
import { useDashboardSearch } from "@/lib/pageSearch";
import logoImg from "@assets/vv_1778503190047.png";
import { useAuth } from "@/lib/auth";
import {
  useGetDashboardStats,
  useListUsers,
  useGetTimeLogs,
  useListJobs,
  type User,
} from "@workspace/api-client-react";

type UserRoleLabel = "Super Admin" | "Admin" | "Supervisor" | "Coordinator" | "User";
const ROLE_BADGE: Record<UserRoleLabel, { color: string; bg: string; icon: any }> = {
  "Super Admin": { color: "text-purple-700", bg: "bg-purple-50 border-purple-200", icon: Crown },
  Admin: { color: "text-red-700", bg: "bg-red-50 border-red-200", icon: Shield },
  Supervisor: { color: "text-amber-700", bg: "bg-amber-50 border-amber-200", icon: UserCog },
  Coordinator: { color: "text-teal-700", bg: "bg-teal-50 border-teal-200", icon: UserCog },
  User: { color: "text-primary", bg: "bg-primary/10 border-primary/20", icon: UserIcon },
};

const USER_ROLE_LABEL: Record<string, UserRoleLabel> = {
  "super-admin": "Super Admin",
  "admin": "Admin",
  "supervisor": "Supervisor",
  "coordinator": "Coordinator",
  "user": "User",
};

function userRoleLabelFromApi(role: string): UserRoleLabel {
  return USER_ROLE_LABEL[role] ?? "User";
}

function roleBadgeFor(role: UserRoleLabel) {
  return ROLE_BADGE[role] ?? ROLE_BADGE.User;
}

interface UserPerf {
  id: string;
  name: string;
  role: UserRoleLabel;
  jobs: number;
  completed: number;
  score: number;
  scoreTip: string;
  avg: string;
  hours: number;
  reworkInternal: number;
  reworkExternal: number;
  reworkSupervisor: number;
  rework: number;
  overdue: number;
}

interface ReworkCountsReport {
  totals: { internal: number; external: number; supervisor: number };
  byUser: Array<{ userId: string; internal: number; external: number; supervisor: number }>;
}

interface DailyTimeRow {
  userId: string;
  userName: string;
  userRole: string;
  date: string;
  totalSeconds: number;
  sessionCount: number;
  jobCount: number;
}

interface DailyTimeReport {
  timezone: string;
  from: string;
  to: string;
  rows: DailyTimeRow[];
  userTotals: Array<{
    userId: string;
    userName: string;
    userRole: string;
    totalSeconds: number;
    daysWorked: number;
    sessionCount: number;
    jobCount: number;
  }>;
}

const REPORT_TZ = "Asia/Karachi";

const formatDatePkt = (ms: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: REPORT_TZ }).format(new Date(ms));

const formatDisplayDate = (dateStr: string) => {
  const parsed = new Date(`${dateStr}T12:00:00`);
  if (!Number.isFinite(parsed.getTime())) return dateStr;
  return parsed.toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: REPORT_TZ,
  });
};

export default function Reports({ role = "super-admin" as Role }: { role?: Role } = {}) {
  const { user: currentUser } = useAuth();
  const { data: dashboardData, isLoading: statsLoading } = useGetDashboardStats();
  const { data: apiUsers, isLoading: usersLoading } = useListUsers();
  const { data: apiTimeLogs, isLoading: logsLoading } = useGetTimeLogs();
  const { data: apiJobs, isLoading: jobsLoading } = useListJobs();
  const [jobMemberships, setJobMemberships] = useState<Record<string, string[]>>({});

  const isUser = role === "user";
  const jobBase =
    role === "super-admin" ? "/super-admin/jobs"
    : role === "admin" ? "/admin/jobs"
    : role === "supervisor" ? "/supervisor/jobs"
    : "/user/jobs";

  const canViewDailyReport = role === "admin" || role === "super-admin";

  const USER_TABS = [
    { id: "progress", label: "Progress Report", icon: TrendingUp },
    { id: "summary", label: "Work Summary", icon: FileText },
  ];

  const ADMIN_TABS = useMemo(() => {
    const tabs = [
      { id: "system", label: "System-wide", icon: TrendingUp },
      { id: "users", label: "User Performance", icon: Users },
      { id: "time", label: "Time Tracking", icon: Clock },
    ];
    if (canViewDailyReport) {
      tabs.push({ id: "daily", label: "Daily Time", icon: CalendarDays });
    }
    return tabs;
  }, [canViewDailyReport]);

  const ACTIVE_TABS = isUser ? USER_TABS : ADMIN_TABS;

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
              ? data
                  .filter((member) => member?.role === "user" && typeof member.id === "string")
                  .map((member) => member.id)
              : [];
            if (userIds.length === 0 && job.assignee?.role === "user" && job.assignee.id) {
              return [job.id, [job.assignee.id]] as const;
            }
            return [job.id, userIds] as const;
          }),
        );
        if (!cancelled) {
          setJobMemberships(Object.fromEntries(entries));
        }
      } catch {
        if (!cancelled) setJobMemberships({});
      }
    })();

    return () => { cancelled = true; };
  }, [apiJobs]);

  const [activeTab, setActiveTab] = useState(isUser ? "progress" : "system");
  const [period, setPeriod] = useState("30d");
  const [userRoleFilter, setUserRoleFilter] = useState<"All" | UserRoleLabel>("All");
  const [filterOpen, setFilterOpen] = useState(false);
  const { search, setSearch, setPlaceholder, headerSearch } = useDashboardSearch("User name…");
  const [minScore, setMinScore] = useState(0);
  const [dailyUserFilter, setDailyUserFilter] = useState("all");
  const [dailyReport, setDailyReport] = useState<DailyTimeReport | null>(null);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [dailyDateFrom, setDailyDateFrom] = useState("");
  const [dailyDateTo, setDailyDateTo] = useState("");
  const [userReportPreview, setUserReportPreview] = useState<{ user: UserPerf; html: string } | null>(null);
  const [userReportPreviewLoading, setUserReportPreviewLoading] = useState(false);
  const [reworkCounts, setReworkCounts] = useState<ReworkCountsReport | null>(null);

  useEffect(() => {
    const placeholder =
      activeTab === "time" ? "User or project…"
      : activeTab === "daily" ? "Worker name…"
      : "User name…";
    setPlaceholder(placeholder);
  }, [activeTab, setPlaceholder]);

  const parseMs = (iso: string | null | undefined) => {
    if (!iso) return null;
    const ms = new Date(iso).getTime();
    return Number.isFinite(ms) ? ms : null;
  };

  const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

  const formatAvgResolution = (hours: number) => {
    if (!Number.isFinite(hours) || hours <= 0) return "0h 0m 0s";
    return formatDurationSeconds(Math.round(hours * 3600));
  };

  const periodDays =
    period === "7d" ? 7
    : period === "30d" ? 30
    : period === "90d" ? 90
    : null;

  const periodAnchorMs = useMemo(() => Date.now(), [period]);
  const periodStartMs = periodDays ? periodAnchorMs - periodDays * 24 * 60 * 60 * 1000 : null;

  const dailyRange = useMemo(() => {
    const to = formatDatePkt(periodAnchorMs);
    if (!periodDays) return { from: "2020-01-01", to };
    return { from: formatDatePkt(periodStartMs!), to };
  }, [periodAnchorMs, periodDays, periodStartMs]);

  const effectiveDailyRange = useMemo(() => {
    if (!dailyDateFrom && !dailyDateTo) return dailyRange;
    return {
      from: dailyDateFrom || dailyRange.from,
      to: dailyDateTo || dailyRange.to,
    };
  }, [dailyRange, dailyDateFrom, dailyDateTo]);

  useEffect(() => {
    if (activeTab !== "daily" || !canViewDailyReport) return;
    let cancelled = false;
    (async () => {
      setDailyLoading(true);
      try {
        const params = new URLSearchParams({
          from: effectiveDailyRange.from,
          to: effectiveDailyRange.to,
        });
        if (dailyUserFilter !== "all") params.set("userId", dailyUserFilter);
        const res = await fetch(`/api/reports/daily-time?${params.toString()}`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to load daily time report");
        const data = (await res.json()) as DailyTimeReport;
        if (!cancelled) setDailyReport(data);
      } catch {
        if (!cancelled) setDailyReport(null);
      } finally {
        if (!cancelled) setDailyLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [activeTab, canViewDailyReport, effectiveDailyRange.from, effectiveDailyRange.to, dailyUserFilter]);

  useEffect(() => {
    if (isUser) return;
    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams({
          from: dailyRange.from,
          to: dailyRange.to,
        });
        const res = await fetch(`/api/reports/rework-counts?${params.toString()}`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to load rework counts");
        const data = (await res.json()) as ReworkCountsReport;
        if (!cancelled) setReworkCounts(data);
      } catch {
        if (!cancelled) setReworkCounts(null);
      }
    })();
    return () => { cancelled = true; };
  }, [isUser, dailyRange.from, dailyRange.to, period]);

  const reworkByUserId = useMemo(() => {
    const map = new Map<string, { internal: number; external: number; supervisor: number }>();
    for (const row of reworkCounts?.byUser ?? []) {
      map.set(row.userId, {
        internal: row.internal,
        external: row.external,
        supervisor: row.supervisor,
      });
    }
    return map;
  }, [reworkCounts]);

  useEffect(() => {
    setDailyDateFrom("");
    setDailyDateTo("");
  }, [period]);

  const isJobInPeriod = (j: any) => {
    if (!periodStartMs) return true;
    const createdMs = parseMs(j?.createdAt);
    const updatedMs = parseMs(j?.updatedAt);
    const completedMs = parseMs(j?.completedAt);
    const dueMs = parseMs(j?.dueDate);
    return (
      (createdMs != null && createdMs >= periodStartMs) ||
      (updatedMs != null && updatedMs >= periodStartMs) ||
      (completedMs != null && completedMs >= periodStartMs) ||
      (dueMs != null && dueMs >= periodStartMs)
    );
  };

  const isUserAssignedToJob = (j: any, userId: string) => {
    if (j.assignee?.id === userId) return true;
    if ((j.assignees ?? []).some((member: { id?: string }) => member?.id === userId)) return true;
    return (jobMemberships[j.id] ?? []).includes(userId);
  };

  const userPerformance: UserPerf[] = useMemo(() => {
    return (apiUsers ?? []).map((u: User) => {
      const userJobsAll = (apiJobs ?? []).filter((j) => isUserAssignedToJob(j, u.id));

      const userJobs = userJobsAll.filter(isJobInPeriod);
      const userLogs = (apiTimeLogs ?? [])
        .filter(l => l.userId === u.id)
        .filter(l => {
          if (!periodStartMs) return true;
          const createdMs = parseMs(l.createdAt);
          return createdMs != null && createdMs >= periodStartMs;
        });
      const totalSeconds = userLogs.reduce((acc, log) => acc + (log.duration ?? 0), 0);

      const completedJobs = userJobs
        .filter(j => j.status === "completed")
        .filter(j => {
          if (!periodStartMs) return true;
          const completedMs = parseMs((j as any).completedAt);
          return completedMs != null && completedMs >= periodStartMs;
        });
      const completedCount = completedJobs.length;

      const isJobOverdue = (j: any) => {
        if (typeof j?.isOverdue === "boolean") return j.isOverdue;
        return isJobOverdueByDueDate(j?.dueDate, j?.status ?? "");
      };

      const overdue = userJobs.filter(isJobOverdue).length;
      const reworkStats = reworkByUserId.get(u.id) ?? { internal: 0, external: 0, supervisor: 0 };
      const reworkInternal = reworkStats.internal;
      const reworkExternal = reworkStats.external;
      const reworkSupervisor = reworkStats.supervisor;
      const rework = reworkInternal + reworkExternal + reworkSupervisor;

      const resolutionHours: number[] = [];
      const completedOnTimeCount = completedJobs.reduce((acc, j: any) => {
        const createdMs = parseMs(j?.createdAt);
        const completedMs = parseMs(j?.completedAt);
        if (createdMs != null && completedMs != null && completedMs >= createdMs) {
          resolutionHours.push((completedMs - createdMs) / 36e5);
        }
        const dueMs = parseMs(j?.dueDate);
        if (dueMs != null && completedMs != null) return acc + (completedMs <= dueMs ? 1 : 0);
        return acc;
      }, 0);

      const avgResolutionHours =
        resolutionHours.length > 0
          ? resolutionHours.reduce((a, b) => a + b, 0) / resolutionHours.length
          : 0;

      const totalJobs = userJobs.length;
      const completionRate = totalJobs > 0 ? completedCount / totalJobs : 0;
      const onTimeRate = completedCount > 0 ? completedOnTimeCount / completedCount : 0;
      const reworkRate = totalJobs > 0 ? rework / totalJobs : 0;

      const completionScore = completionRate * 60;
      const onTimeScore = onTimeRate * 25;
      const reworkScore = totalJobs > 0 ? (1 - clamp(reworkRate, 0, 1)) * 15 : 0;
      const score =
        totalJobs === 0
          ? 0
          : Math.round(clamp(completionScore + onTimeScore + reworkScore, 0, 100));
      const scoreTip =
        totalJobs === 0
          ? "No jobs assigned in this period"
          : `Completion ${Math.round(completionScore)}/60 · On-time ${Math.round(onTimeScore)}/25 · Low rework ${Math.round(reworkScore)}/15`;

      return {
        id: u.id,
        name: u.name,
        role: userRoleLabelFromApi(u.role),
        jobs: totalJobs,
        completed: completedCount,
        score,
        scoreTip,
        avg: formatAvgResolution(avgResolutionHours),
        hours: totalSeconds,
        reworkInternal,
        reworkExternal,
        reworkSupervisor,
        rework,
        overdue,
      };
    });
  }, [apiUsers, apiJobs, apiTimeLogs, periodStartMs, jobMemberships, reworkByUserId]);

  const userNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const u of apiUsers ?? []) {
      map[u.id] = u.name;
    }
    return map;
  }, [apiUsers]);

  const jobLabelById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const j of apiJobs ?? []) {
      map[j.id] = `${j.number} · ${j.title}`;
    }
    return map;
  }, [apiJobs]);

  const timeLogs = useMemo(() => {
    return (apiTimeLogs ?? [])
      .filter((l) => {
        if (!periodStartMs) return true;
        const createdMs = parseMs(l.createdAt);
        return createdMs != null && createdMs >= periodStartMs;
      })
      .map(l => ({
        user: userNameById[l.userId] ?? `${l.userId.slice(0, 8)}…`,
        project: l.jobId ? (jobLabelById[l.jobId] ?? "Job") : "General",
        seconds: l.duration ?? 0,
      }));
  }, [apiTimeLogs, userNameById, jobLabelById, periodStartMs]);

  const pctChange = (current: number, previous: number) => {
    if (!Number.isFinite(current) || !Number.isFinite(previous)) return 0;
    if (previous <= 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
  };

  const systemMetrics = useMemo(() => {
    const days =
      period === "7d" ? 7
      : period === "30d" ? 30
      : period === "90d" ? 90
      : null;

    const totalUsers = dashboardData?.stats.totalUsers ?? 0;
    const totalJobs = dashboardData?.stats.totalJobs ?? 0;
    const activeJobs = dashboardData?.stats.activeJobs ?? 0;
    const overdueJobs = dashboardData?.stats.overdueJobs ?? 0;

    if (!days) {
      return [
        { label: "Total Users", value: String(totalUsers), change: "—", trend: "up" as const },
        { label: "Total Jobs", value: String(totalJobs), change: "—", trend: "up" as const },
        { label: "Active Jobs", value: String(activeJobs), change: "—", trend: "up" as const },
        { label: "Overdue Jobs", value: String(overdueJobs), change: "—", trend: "up" as const },
      ];
    }

    const nowMs = Date.now();
    const prevMs = nowMs - days * 24 * 60 * 60 * 1000;

    const usersPrev = (apiUsers ?? []).filter((u: User) => {
      const createdMs = parseMs(u.createdAt as unknown as string);
      return createdMs != null && createdMs <= prevMs;
    }).length;

    const jobsPrev = (apiJobs ?? []).filter((j) => {
      const createdMs = parseMs(j.createdAt);
      return createdMs != null && createdMs <= prevMs;
    }).length;

    const activePrev = (apiJobs ?? []).filter((j) => {
      if (j.status !== "in_progress") return false;
      const createdMs = parseMs(j.createdAt);
      if (createdMs == null || createdMs > prevMs) return false;
      const completedMs = parseMs(j.completedAt);
      if (completedMs != null && completedMs <= prevMs) return false;
      return true;
    }).length;

    const overduePrev = (apiJobs ?? []).filter((j) => {
      if (j.status === "completed") return false;
      const createdMs = parseMs(j.createdAt);
      if (createdMs == null || createdMs > prevMs) return false;
      const dueMs = parseMs(j.dueDate);
      if (dueMs == null) return false;
      return dueMs < prevMs;
    }).length;

    const usersChange = pctChange(totalUsers, usersPrev);
    const jobsChange = pctChange(totalJobs, jobsPrev);
    const activeChange = pctChange(activeJobs, activePrev);
    const overdueChange = pctChange(overdueJobs, overduePrev);

    return [
      { label: "Total Users", value: String(totalUsers), change: `${Math.abs(usersChange)}%`, trend: usersChange >= 0 ? "up" as const : "down" as const },
      { label: "Total Jobs", value: String(totalJobs), change: `${Math.abs(jobsChange)}%`, trend: jobsChange >= 0 ? "up" as const : "down" as const },
      { label: "Active Jobs", value: String(activeJobs), change: `${Math.abs(activeChange)}%`, trend: activeChange >= 0 ? "up" as const : "down" as const },
      { label: "Overdue Jobs", value: String(overdueJobs), change: `${Math.abs(overdueChange)}%`, trend: overdueJobs <= overduePrev ? "up" as const : "down" as const },
    ];
  }, [dashboardData, apiUsers, apiJobs, period]);

  const resetFilters = () => {
    setSearch(""); setUserRoleFilter("All");
    setMinScore(0);
    setDailyUserFilter("all");
    setDailyDateFrom("");
    setDailyDateTo("");
  };

  const isFilterableTab =
    activeTab === "users" ||
    activeTab === "time" ||
    activeTab === "daily";

  useEffect(() => {
    if (!isFilterableTab && filterOpen) setFilterOpen(false);
  }, [isFilterableTab, filterOpen]);

  const activeFilterCount = useMemo(() => {
    if (!isFilterableTab) return 0;
    const base = search ? 1 : 0;
    if (activeTab === "users") {
      return base + (userRoleFilter !== "All" ? 1 : 0) + (minScore > 0 ? 1 : 0);
    }
    if (activeTab === "time") {
      return base;
    }
    if (activeTab === "daily") {
      return base
        + (dailyUserFilter !== "all" ? 1 : 0)
        + (dailyDateFrom ? 1 : 0)
        + (dailyDateTo ? 1 : 0);
    }
    return base;
  }, [activeTab, isFilterableTab, search, userRoleFilter, minScore, dailyUserFilter, dailyDateFrom, dailyDateTo]);
  const isSuperAdmin = role === "super-admin";
  const ROLE_FILTERS: ("All" | UserRoleLabel)[] = isSuperAdmin
    ? ["All", "Admin", "Supervisor", "Coordinator", "User"]
    : ["All", "Supervisor", "Coordinator", "User"];

  const filteredUsers = userPerformance.filter((u) =>
    (userRoleFilter === "All" || u.role === userRoleFilter) &&
    (search === "" || u.name.toLowerCase().includes(search.toLowerCase())) &&
    u.score >= minScore
  );
  
  const filteredTime = timeLogs.filter((t) =>
    search === "" || t.user.toLowerCase().includes(search.toLowerCase()) || t.project.toLowerCase().includes(search.toLowerCase())
  );

  const dailyWorkers = useMemo(
    () => (apiUsers ?? []).filter((u) => u.role === "user" || u.role === "supervisor"),
    [apiUsers],
  );

  const filteredDailyRows = useMemo(() => {
    const rows = dailyReport?.rows ?? [];
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter((row) => row.userName.toLowerCase().includes(q));
  }, [dailyReport, search]);

  const dailySummary = useMemo(() => {
    const rows = filteredDailyRows;
    const totalSeconds = rows.reduce((sum, row) => sum + row.totalSeconds, 0);
    const uniqueWorkers = new Set(rows.map((row) => row.userId)).size;
    const uniqueDays = new Set(rows.map((row) => row.date)).size;
    const totalSessions = rows.reduce((sum, row) => sum + row.sessionCount, 0);
    return { totalSeconds, uniqueWorkers, uniqueDays, totalSessions, rowCount: rows.length };
  }, [filteredDailyRows]);

  const dailyChartRows = useMemo(() => {
    if (dailyUserFilter === "all") return [];
    return [...filteredDailyRows].sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredDailyRows, dailyUserFilter]);

  const filteredDailyTotals = useMemo(() => {
    return (dailyReport?.userTotals ?? [])
      .filter((total) => !search.trim() || total.userName.toLowerCase().includes(search.toLowerCase()));
  }, [dailyReport, search]);

  const dailyChartMaxSeconds = useMemo(
    () => dailyChartRows.reduce((max, row) => Math.max(max, row.totalSeconds), 0),
    [dailyChartRows],
  );

  const usersP = usePagination(filteredUsers, 50);
  const timeP = usePagination(filteredTime, 8);
  const dailyP = usePagination(filteredDailyRows, 100);
  const dailyTotalsP = usePagination(filteredDailyTotals, 30);
  const dailyChartP = usePagination(dailyChartRows, 30);

  const platformJobStats = useMemo(() => {
    const jobs = (apiJobs ?? []).filter(isJobInPeriod);
    const completed = jobs.filter((j) => {
      if (j.status !== "completed") return false;
      if (!periodStartMs) return true;
      const completedMs = parseMs(j.completedAt);
      return completedMs != null && completedMs >= periodStartMs;
    });
    const reworkInternal = reworkCounts?.totals.internal ?? 0;
    const reworkExternal = reworkCounts?.totals.external ?? 0;
    const reworkSupervisor = reworkCounts?.totals.supervisor ?? 0;
    const totalLoggedSeconds = (apiTimeLogs ?? [])
      .filter((l) => {
        if (!periodStartMs) return true;
        const createdMs = parseMs(l.createdAt);
        return createdMs != null && createdMs >= periodStartMs;
      })
      .reduce((sum, log) => sum + (log.duration ?? 0), 0);
    return {
      total: jobs.length,
      completed: completed.length,
      totalLoggedSeconds,
      reworkInternal,
      reworkExternal,
      reworkSupervisor,
      rework: reworkInternal + reworkExternal + reworkSupervisor,
    };
  }, [apiJobs, apiTimeLogs, periodStartMs, reworkCounts]);

  const totalJobs = platformJobStats.total;
  const totalCompleted = platformJobStats.completed;
  const totalLoggedSeconds = platformJobStats.totalLoggedSeconds;
  const totalReworkInternal = platformJobStats.reworkInternal;
  const totalReworkExternal = platformJobStats.reworkExternal;
  const totalRework = platformJobStats.rework;

  const reworkCountClass = (n: number) =>
    n > 3 ? "text-red-600 font-semibold" : n > 0 ? "text-amber-600" : "text-gray-400";

  const anyLoading = statsLoading || usersLoading || logsLoading || jobsLoading;
  const anyData = dashboardData || apiUsers || apiTimeLogs || apiJobs;

  if (anyLoading && !anyData) {
    return (
      <DashboardLayout title="Reports" role={role} headerSearch={headerSearch}>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </DashboardLayout>
    );
  }

  const resolveLogoDataUrl = async () => {
    try {
      const abs = new URL(logoImg, window.location.href).href;
      const res = await fetch(abs, { cache: "force-cache" });
      if (!res.ok) return abs;
      const blob = await res.blob();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(new Error("Failed to read logo"));
        reader.readAsDataURL(blob);
      });
      return dataUrl || abs;
    } catch {
      try {
        return new URL(logoImg, window.location.href).href;
      } catch {
        return logoImg;
      }
    }
  };

  const openPrintWindow = () => {
    const w = window.open("", "_blank", "width=900,height=1000");
    if (!w) {
      alert("Please allow pop-ups to export the report.");
      return null;
    }
    return w;
  };

  const buildUserReportHtml = async (u: UserPerf, opts?: { autoPrint?: boolean }) => {
    const periodLabel = period === "All" ? "All time" : `Last ${period}`;
    const rate = u.jobs > 0 ? Math.round((u.completed / u.jobs) * 100) : 0;
    const logoUrl = await resolveLogoDataUrl();
    const printScript = opts?.autoPrint
      ? `<script>
  (async () => {
    const imgs = Array.from(document.images || []);
    await Promise.all(imgs.map(img => img.complete ? Promise.resolve() : new Promise((r) => { img.onload = img.onerror = () => r(); })));
    if (document.fonts && document.fonts.ready) {
      try { await document.fonts.ready; } catch {}
    }
    setTimeout(() => window.print(), 50);
  })();
</script>`
      : "";
    const printButton = opts?.autoPrint
      ? `<button class="btn no-print" onclick="window.print()">Save as PDF</button>`
      : "";

    return `<!doctype html><html><head><meta charset="utf-8"><title>${u.name} Performance Report</title>
<style>
@page{size:A4;margin:14mm 16mm}
*{box-sizing:border-box}html,body{margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f172a;padding:16px}
.brand{display:flex;justify-content:space-between;align-items:center;background:#000;border-bottom:3px solid #0B7EB9;padding:20px 22px;margin:0 0 22px;gap:16px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.brand img{height:76px;width:auto;object-fit:contain;display:block}
.brand .meta{font-size:11px;color:#cbd5e1;text-align:right;line-height:1.6}
.brand .meta strong{display:block;color:#fff;font-size:14px;margin-bottom:2px;letter-spacing:.2px}
.user{display:flex;align-items:center;gap:16px;margin-bottom:24px}
.avatar{width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#0B7EB9,#0369a1);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:20px}
.user h2{margin:0;font-size:20px}
.role{display:inline-block;padding:2px 10px;border-radius:6px;font-size:11px;font-weight:600;margin-top:4px;background:#f1f5f9;color:#334155;border:1px solid #e2e8f0}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:28px}
.kpi{padding:14px;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc}
.kpi .l{font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.5px;font-weight:600}
.kpi .v{font-size:22px;font-weight:700;margin-top:4px}
h3{font-size:13px;text-transform:uppercase;letter-spacing:.6px;color:#475569;margin:24px 0 10px}
table{width:100%;border-collapse:collapse;font-size:12px}
th{text-align:left;padding:10px;background:#f1f5f9;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#475569;border-bottom:1px solid #e2e8f0}
td{padding:10px;border-bottom:1px solid #f1f5f9}
.bar{height:6px;background:#e2e8f0;border-radius:3px;overflow:hidden;width:140px;display:inline-block;vertical-align:middle;margin-right:8px}
.bar>div{height:100%;background:${u.score >= 90 ? "#10b981" : u.score >= 80 ? "#0B7EB9" : "#f59e0b"};width:${u.score}%}
.foot{margin-top:40px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:10px;color:#94a3b8;text-align:center}
@media print{.no-print{display:none}}
.btn{position:fixed;top:20px;right:20px;background:#0B7EB9;color:#fff;border:0;padding:10px 18px;border-radius:8px;font-weight:600;cursor:pointer;box-shadow:0 4px 12px rgba(11,126,185,.4)}
</style></head><body>
${printButton}
<div class="brand"><img src="${logoUrl}" alt="Vivid OPS"><div class="meta"><strong>${u.name} Performance Report</strong>Generated ${new Date().toLocaleString()}<br>Period: ${periodLabel}</div></div>
<div class="user">
  <div class="avatar">${u.name.split(" ").map((s) => s[0]).join("")}</div>
  <div><h2>${u.name}</h2><span class="role">${u.role}</span></div>
</div>
<h3>Performance summary</h3>
<div class="kpis">
  <div class="kpi"><div class="l">Total jobs</div><div class="v">${u.jobs}</div></div>
  <div class="kpi"><div class="l">Completed</div><div class="v" style="color:#10b981">${u.completed}</div></div>
  <div class="kpi"><div class="l">Completion rate</div><div class="v">${rate}%</div></div>
  <div class="kpi"><div class="l">Performance score</div><div class="v">${u.score}</div></div>
</div>
<h3>Detailed metrics</h3>
<table>
  <thead><tr><th>Metric</th><th>Value</th><th>Status</th></tr></thead>
  <tbody>
    <tr><td>Hours logged</td><td>${formatDurationSeconds(u.hours)}</td><td style="color:#64748b">—</td></tr>
    <tr><td>Average resolution time</td><td>${u.avg}</td><td style="color:#64748b">—</td></tr>
    <tr><td>Internal rework</td><td>${u.reworkInternal}</td><td style="color:${u.reworkInternal > 3 ? "#dc2626" : u.reworkInternal > 0 ? "#d97706" : "#10b981"}">${u.reworkInternal > 3 ? "High" : u.reworkInternal > 0 ? "Moderate" : "Excellent"}</td></tr>
    <tr><td>External rework</td><td>${u.reworkExternal}</td><td style="color:${u.reworkExternal > 3 ? "#dc2626" : u.reworkExternal > 0 ? "#d97706" : "#10b981"}">${u.reworkExternal > 3 ? "High" : u.reworkExternal > 0 ? "Moderate" : "Excellent"}</td></tr>
    <tr><td>Supervisor rework</td><td>${u.reworkSupervisor}</td><td style="color:#64748b">—</td></tr>
    <tr><td>Overdue jobs</td><td>${u.overdue}</td><td style="color:${u.overdue > 0 ? "#dc2626" : "#10b981"}">${u.overdue > 0 ? "Needs attention" : "On track"}</td></tr>
    <tr><td>Performance score</td><td><span class="bar"><div></div></span>${u.score} / 100</td><td style="color:${u.score >= 90 ? "#10b981" : u.score >= 80 ? "#0B7EB9" : "#d97706"}">${u.score >= 90 ? "Excellent" : u.score >= 80 ? "Good" : "Needs improvement"}</td></tr>
  </tbody>
</table>
<h3>Notes</h3>
<p style="font-size:12px;color:#475569;line-height:1.6">This report covers ${u.name}'s activity during the selected period (${periodLabel}). <strong>Hours logged</strong> is timer work time. <strong>Average resolution time</strong> is calendar time from job created to completed (not timer hours). Score is calculated from completion rate, on-time delivery, rework frequency, and supervisor sign-off.</p>
<div class="foot">Vivid OPS · Confidential · Generated for internal use only</div>
${printScript}
</body></html>`;
  };

  const previewUserReport = async (u: UserPerf) => {
    setUserReportPreviewLoading(true);
    try {
      const html = await buildUserReportHtml(u);
      setUserReportPreview({ user: u, html });
    } finally {
      setUserReportPreviewLoading(false);
    }
  };

  const exportUserPDF = async (u: UserPerf) => {
    const w = openPrintWindow();
    if (!w) return;
    const html = await buildUserReportHtml(u, { autoPrint: true });
    w.document.open();
    w.document.write(html);
    w.document.close();
  };

  const printPreviewedUserReport = async () => {
    if (!userReportPreview) return;
    const w = openPrintWindow();
    if (!w) return;
    const html = await buildUserReportHtml(userReportPreview.user, { autoPrint: true });
    w.document.open();
    w.document.write(html);
    w.document.close();
  };

  const exportUsersPDF = async () => {
    const periodLabel = period === "All" ? "All time" : `Last ${period}`;
    const w = openPrintWindow();
    if (!w) return;
    const logoUrl = await resolveLogoDataUrl();
    const rows = filteredUsers
      .map(
        (u) =>
          `<tr><td>${u.name}</td><td>${u.role}</td><td style="text-align:right">${u.jobs}</td><td style="text-align:right">${u.completed}</td><td style="text-align:right">${formatDurationSeconds(u.hours)}</td><td style="text-align:right">${u.overdue}</td><td style="text-align:right">${u.reworkInternal}</td><td style="text-align:right">${u.reworkExternal}</td><td style="text-align:right">${u.score}</td></tr>`,
      )
      .join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>User Performance</title>
<style>
@page{size:A4;margin:14mm 16mm}
*{box-sizing:border-box}html,body{margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f172a}
.brand{display:flex;justify-content:space-between;align-items:center;background:#000;border-bottom:3px solid #0B7EB9;padding:20px 22px;margin:0 0 22px;gap:16px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.brand img{height:76px;width:auto;object-fit:contain;display:block}
.brand .meta{font-size:11px;color:#cbd5e1;text-align:right;line-height:1.6}
.brand .meta strong{display:block;color:#fff;font-size:14px;margin-bottom:2px;letter-spacing:.2px}
h2{margin:0 0 8px;font-size:16px}
.sub{margin:0 0 18px;color:#64748b;font-size:12px}
table{width:100%;border-collapse:collapse;font-size:12px}
th{text-align:left;padding:10px;background:#f1f5f9;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#475569;border-bottom:1px solid #e2e8f0}
td{padding:10px;border-bottom:1px solid #f1f5f9}
@media print{.no-print{display:none}}
.btn{position:fixed;top:20px;right:20px;background:#0B7EB9;color:#fff;border:0;padding:10px 18px;border-radius:8px;font-weight:600;cursor:pointer;box-shadow:0 4px 12px rgba(11,126,185,.4)}
</style></head><body>
<button class="btn no-print" onclick="window.print()">Save as PDF</button>
<div class="brand"><img src="${logoUrl}" alt="Vivid OPS"><div class="meta"><strong>User Performance</strong>Generated ${new Date().toLocaleString()}<br>Period: ${periodLabel}</div></div>
<h2>Users: ${filteredUsers.length}</h2>
<p class="sub">Filters: role=${userRoleFilter} · minScore=${minScore}${search ? ` · search="${search.replaceAll('"', "&quot;")}"` : ""}</p>
<table>
<thead><tr><th>User</th><th>Role</th><th style="text-align:right">Jobs</th><th style="text-align:right">Completed</th><th style="text-align:right">Hours</th><th style="text-align:right">Overdue</th><th style="text-align:right">Internal rework</th><th style="text-align:right">External rework</th><th style="text-align:right">Score</th></tr></thead>
<tbody>${rows || `<tr><td colspan="9" style="padding:14px;color:#64748b">No users found.</td></tr>`}</tbody>
</table>
<script>
  (async () => {
    const imgs = Array.from(document.images || []);
    await Promise.all(imgs.map(img => img.complete ? Promise.resolve() : new Promise((r) => { img.onload = img.onerror = () => r(); })));
    if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch {} }
    setTimeout(() => window.print(), 50);
  })();
</script>
</body></html>`;
    w.document.open();
    w.document.write(html);
    w.document.close();
  };

  const exportTimePDF = async () => {
    const periodLabel = period === "All" ? "All time" : `Last ${period}`;
    const w = openPrintWindow();
    if (!w) return;
    const logoUrl = await resolveLogoDataUrl();
    const rows = filteredTime
      .map((t) => `<tr><td>${t.user}</td><td>${t.project}</td><td style="text-align:right">${formatDurationSeconds(t.seconds)}</td></tr>`)
      .join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Time Tracking</title>
<style>
@page{size:A4;margin:14mm 16mm}
*{box-sizing:border-box}html,body{margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f172a}
.brand{display:flex;justify-content:space-between;align-items:center;background:#000;border-bottom:3px solid #0B7EB9;padding:20px 22px;margin:0 0 22px;gap:16px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.brand img{height:76px;width:auto;object-fit:contain;display:block}
.brand .meta{font-size:11px;color:#cbd5e1;text-align:right;line-height:1.6}
.brand .meta strong{display:block;color:#fff;font-size:14px;margin-bottom:2px;letter-spacing:.2px}
h2{margin:0 0 8px;font-size:16px}
.sub{margin:0 0 18px;color:#64748b;font-size:12px}
table{width:100%;border-collapse:collapse;font-size:12px}
th{text-align:left;padding:10px;background:#f1f5f9;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#475569;border-bottom:1px solid #e2e8f0}
td{padding:10px;border-bottom:1px solid #f1f5f9}
@media print{.no-print{display:none}}
.btn{position:fixed;top:20px;right:20px;background:#0B7EB9;color:#fff;border:0;padding:10px 18px;border-radius:8px;font-weight:600;cursor:pointer;box-shadow:0 4px 12px rgba(11,126,185,.4)}
</style></head><body>
<button class="btn no-print" onclick="window.print()">Save as PDF</button>
<div class="brand"><img src="${logoUrl}" alt="Vivid OPS"><div class="meta"><strong>Time Tracking</strong>Generated ${new Date().toLocaleString()}<br>Period: ${periodLabel}</div></div>
<h2>Entries: ${filteredTime.length}</h2>
<p class="sub">${search ? `Search: "${search.replaceAll('"', "&quot;")}"` : "All entries"}</p>
<table>
<thead><tr><th>User</th><th>Project</th><th style="text-align:right">Hours</th></tr></thead>
<tbody>${rows || `<tr><td colspan="3" style="padding:14px;color:#64748b">No time logs found.</td></tr>`}</tbody>
</table>
<script>
  (async () => {
    const imgs = Array.from(document.images || []);
    await Promise.all(imgs.map(img => img.complete ? Promise.resolve() : new Promise((r) => { img.onload = img.onerror = () => r(); })));
    if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch {} }
    setTimeout(() => window.print(), 50);
  })();
</script>
</body></html>`;
    w.document.open();
    w.document.write(html);
    w.document.close();
  };

  const exportSystemPDF = async () => {
    const periodLabel = period === "All" ? "All time" : `Last ${period}`;
    const w = openPrintWindow();
    if (!w) return;
    const logoUrl = await resolveLogoDataUrl();
    const jobs = (dashboardData?.recentJobs ?? []) as any[];
    const rows = jobs
      .map((j) => {
        const title = j?.title ?? "—";
        const client = j?.client ?? "—";
        const status = String(j?.status ?? "—");
        const updated = j?.updatedAt ? new Date(j.updatedAt).toLocaleString() : "—";
        return `<tr><td>${title}</td><td>${client}</td><td>${status}</td><td>${updated}</td></tr>`;
      })
      .join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>System-wide Report</title>
<style>
@page{size:A4;margin:14mm 16mm}
*{box-sizing:border-box}html,body{margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f172a}
.brand{display:flex;justify-content:space-between;align-items:center;background:#000;border-bottom:3px solid #0B7EB9;padding:20px 22px;margin:0 0 22px;gap:16px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.brand img{height:76px;width:auto;object-fit:contain;display:block}
.brand .meta{font-size:11px;color:#cbd5e1;text-align:right;line-height:1.6}
.brand .meta strong{display:block;color:#fff;font-size:14px;margin-bottom:2px;letter-spacing:.2px}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:22px}
.kpi{padding:14px;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc}
.kpi .l{font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.5px;font-weight:600}
.kpi .v{font-size:22px;font-weight:700;margin-top:4px}
h2{margin:0 0 10px;font-size:16px}
table{width:100%;border-collapse:collapse;font-size:12px}
th{text-align:left;padding:10px;background:#f1f5f9;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#475569;border-bottom:1px solid #e2e8f0}
td{padding:10px;border-bottom:1px solid #f1f5f9}
@media print{.no-print{display:none}}
.btn{position:fixed;top:20px;right:20px;background:#0B7EB9;color:#fff;border:0;padding:10px 18px;border-radius:8px;font-weight:600;cursor:pointer;box-shadow:0 4px 12px rgba(11,126,185,.4)}
</style></head><body>
<button class="btn no-print" onclick="window.print()">Save as PDF</button>
<div class="brand"><img src="${logoUrl}" alt="Vivid OPS"><div class="meta"><strong>System-wide Report</strong>Generated ${new Date().toLocaleString()}<br>Period: ${periodLabel}</div></div>
<div class="grid">
  <div class="kpi"><div class="l">Total users</div><div class="v">${dashboardData?.stats.totalUsers ?? 0}</div></div>
  <div class="kpi"><div class="l">Total jobs</div><div class="v">${dashboardData?.stats.totalJobs ?? 0}</div></div>
  <div class="kpi"><div class="l">Active jobs</div><div class="v">${dashboardData?.stats.activeJobs ?? 0}</div></div>
  <div class="kpi"><div class="l">Overdue jobs</div><div class="v">${dashboardData?.stats.overdueJobs ?? 0}</div></div>
</div>
<h2>Recent jobs</h2>
<table>
<thead><tr><th>Job</th><th>Client</th><th>Status</th><th>Updated</th></tr></thead>
<tbody>${rows || `<tr><td colspan="4" style="padding:14px;color:#64748b">No recent jobs.</td></tr>`}</tbody>
</table>
<script>
  (async () => {
    const imgs = Array.from(document.images || []);
    await Promise.all(imgs.map(img => img.complete ? Promise.resolve() : new Promise((r) => { img.onload = img.onerror = () => r(); })));
    if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch {} }
    setTimeout(() => window.print(), 50);
  })();
</script>
</body></html>`;
    w.document.open();
    w.document.write(html);
    w.document.close();
  };

  const exportActivePDF = async () => {
    if (activeTab === "users") return exportUsersPDF();
    if (activeTab === "time") return exportTimePDF();
    if (activeTab === "system") return exportSystemPDF();
    if (activeTab === "daily") return exportDailyPDF();
    alert("Nothing to export on this tab.");
  };

  const exportDailyCSV = () => {
    const rows = filteredDailyRows;
    if (rows.length === 0) {
      alert("No daily time rows to export.");
      return;
    }
    const header = ["Date", "Worker", "Role", "Hours", "Jobs", "Sessions"];
    const lines = rows.map((row) => [
      row.date,
      `"${row.userName.replaceAll('"', '""')}"`,
      row.userRole,
      (row.totalSeconds / 3600).toFixed(2),
      String(row.jobCount),
      String(row.sessionCount),
    ].join(","));
    const workerLabel =
      dailyUserFilter === "all"
        ? "all-workers"
        : (dailyWorkers.find((w) => w.id === dailyUserFilter)?.name ?? "worker")
            .replace(/[^\w.-]+/g, "-");
    const blob = new Blob([[header.join(","), ...lines].join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `daily-time-${workerLabel}-${effectiveDailyRange.from}-to-${effectiveDailyRange.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportDailyPDF = async () => {
    const periodLabel = period === "All" ? "All time" : `Last ${period}`;
    const w = openPrintWindow();
    if (!w) return;
    const logoUrl = await resolveLogoDataUrl();
    const workerName =
      dailyUserFilter === "all"
        ? "All workers"
        : dailyWorkers.find((worker) => worker.id === dailyUserFilter)?.name ?? "Worker";
    const summaryRows = (dailyReport?.userTotals ?? [])
      .filter((total) =>
        dailyUserFilter === "all" ? true : total.userId === dailyUserFilter,
      )
      .map(
        (total) =>
          `<tr><td>${total.userName}</td><td>${USER_ROLE_LABEL[total.userRole] ?? total.userRole}</td><td style="text-align:right">${total.daysWorked}</td><td style="text-align:right">${formatDurationSeconds(total.totalSeconds)}</td><td style="text-align:right">${total.sessionCount}</td></tr>`,
      )
      .join("");
    const detailRows = filteredDailyRows
      .map(
        (row) =>
          `<tr><td>${formatDisplayDate(row.date)}</td><td>${row.userName}</td><td>${USER_ROLE_LABEL[row.userRole] ?? row.userRole}</td><td style="text-align:right">${formatDurationSeconds(row.totalSeconds)}</td><td style="text-align:right">${row.jobCount}</td><td style="text-align:right">${row.sessionCount}</td></tr>`,
      )
      .join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Daily Time Report</title>
<style>
@page{size:A4;margin:14mm 16mm}
*{box-sizing:border-box}html,body{margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f172a}
.brand{display:flex;justify-content:space-between;align-items:center;background:#000;border-bottom:3px solid #0B7EB9;padding:20px 22px;margin:0 0 22px;gap:16px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.brand img{height:76px;width:auto;object-fit:contain;display:block}
.brand .meta{font-size:11px;color:#cbd5e1;text-align:right;line-height:1.6}
.brand .meta strong{display:block;color:#fff;font-size:14px;margin-bottom:2px;letter-spacing:.2px}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:22px}
.kpi{padding:14px;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc}
.kpi .l{font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.5px;font-weight:600}
.kpi .v{font-size:22px;font-weight:700;margin-top:4px}
h2{margin:24px 0 10px;font-size:16px}
.sub{margin:0 0 18px;color:#64748b;font-size:12px}
table{width:100%;border-collapse:collapse;font-size:12px}
th{text-align:left;padding:10px;background:#f1f5f9;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#475569;border-bottom:1px solid #e2e8f0}
td{padding:10px;border-bottom:1px solid #f1f5f9}
@media print{.no-print{display:none}}
.btn{position:fixed;top:20px;right:20px;background:#0B7EB9;color:#fff;border:0;padding:10px 18px;border-radius:8px;font-weight:600;cursor:pointer;box-shadow:0 4px 12px rgba(11,126,185,.4)}
</style></head><body>
<button class="btn no-print" onclick="window.print()">Save as PDF</button>
<div class="brand"><img src="${logoUrl}" alt="Vivid OPS"><div class="meta"><strong>Daily Time Report</strong>Generated ${new Date().toLocaleString()}<br>Period: ${periodLabel}<br>Timezone: ${dailyReport?.timezone ?? REPORT_TZ}</div></div>
<p class="sub">Worker filter: ${workerName} · Range: ${effectiveDailyRange.from} to ${effectiveDailyRange.to}${search ? ` · search="${search.replaceAll('"', "&quot;")}"` : ""}</p>
<div class="grid">
  <div class="kpi"><div class="l">Total hours</div><div class="v">${formatDurationSeconds(dailySummary.totalSeconds)}</div></div>
  <div class="kpi"><div class="l">Workers</div><div class="v">${dailySummary.uniqueWorkers}</div></div>
  <div class="kpi"><div class="l">Days with logs</div><div class="v">${dailySummary.uniqueDays}</div></div>
  <div class="kpi"><div class="l">Sessions</div><div class="v">${dailySummary.totalSessions}</div></div>
</div>
<h2>Per-worker totals</h2>
<table>
<thead><tr><th>Worker</th><th>Role</th><th style="text-align:right">Days</th><th style="text-align:right">Hours</th><th style="text-align:right">Sessions</th></tr></thead>
<tbody>${summaryRows || `<tr><td colspan="5" style="padding:14px;color:#64748b">No worker totals.</td></tr>`}</tbody>
</table>
<h2>Daily breakdown</h2>
<table>
<thead><tr><th>Date</th><th>Worker</th><th>Role</th><th style="text-align:right">Hours</th><th style="text-align:right">Jobs</th><th style="text-align:right">Sessions</th></tr></thead>
<tbody>${detailRows || `<tr><td colspan="6" style="padding:14px;color:#64748b">No daily rows found.</td></tr>`}</tbody>
</table>
<script>
  (async () => {
    const imgs = Array.from(document.images || []);
    await Promise.all(imgs.map(img => img.complete ? Promise.resolve() : new Promise((r) => { img.onload = img.onerror = () => r(); })));
    if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch {} }
    setTimeout(() => window.print(), 50);
  })();
</script>
</body></html>`;
    w.document.open();
    w.document.write(html);
    w.document.close();
  };

  return (
    <DashboardLayout title="Reports" role={role} headerSearch={headerSearch}>
      {/* Header actions */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between mb-6">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
          {(["7d", "30d", "90d", "All"] as const).map((p) => (
            <motion.button key={p} whileTap={{ scale: 0.96 }} onClick={() => setPeriod(p)} className={`relative px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${period === p ? "text-white" : "text-gray-600 hover:text-gray-900"}`}>
              {period === p && <motion.div layoutId="periodBg" className="absolute inset-0 bg-primary rounded-lg pointer-events-none" transition={{ type: "spring", stiffness: 300, damping: 25 }} />}
              <span className="relative">{p === "All" ? "All time" : `Last ${p}`}</span>
            </motion.button>
          ))}
        </div>
        <div className="flex items-center gap-2 relative">
          {isFilterableTab && (
            <motion.button whileHover={{ y: -1 }} whileTap={{ scale: 0.97 }} onClick={() => setFilterOpen((v) => !v)} className={`flex items-center gap-2 px-4 py-2.5 bg-white border rounded-xl text-sm font-medium transition-colors ${filterOpen || activeFilterCount > 0 ? "border-primary text-primary" : "border-gray-200 text-gray-700 hover:border-gray-300"}`}>
              <Filter size={14} /> Filters
              {activeFilterCount > 0 && <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-white text-[10px] font-bold">{activeFilterCount}</span>}
            </motion.button>
          )}
          <motion.button whileHover={{ y: -1, scale: 1.02 }} whileTap={{ scale: 0.97 }} onClick={() => void exportActivePDF()} className="flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm font-medium shadow-lg shadow-primary/30">
            <Download size={14} /> Export PDF
          </motion.button>
          {activeTab === "daily" && (
            <motion.button whileHover={{ y: -1, scale: 1.02 }} whileTap={{ scale: 0.97 }} onClick={exportDailyCSV} className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 hover:border-primary text-gray-700 hover:text-primary rounded-xl text-sm font-medium">
              <Download size={14} /> Export CSV
            </motion.button>
          )}

          <AnimatePresence>
            {isFilterableTab && filterOpen && (
              <>
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setFilterOpen(false)} className="fixed inset-0 z-40" />
                <motion.div initial={{ opacity: 0, y: -8, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.97 }} transition={{ type: "spring", stiffness: 300, damping: 25 }} className="absolute right-0 top-full mt-2 w-[340px] bg-white rounded-2xl border border-gray-100 shadow-2xl z-50 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                    <div className="flex items-center gap-2"><Filter size={14} className="text-primary" /><span className="text-sm font-bold text-gray-900">Filters</span>{activeFilterCount > 0 && <span className="text-[10px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">{activeFilterCount} active</span>}</div>
                    <button onClick={() => setFilterOpen(false)} className="p-1 hover:bg-gray-100 rounded-md text-gray-400"><X size={14} /></button>
                  </div>
                  <div className="p-4 space-y-4 max-h-[420px] overflow-y-auto">
                    {activeTab === "users" && (
                      <div>
                        <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Role</label>
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {ROLE_FILTERS.map((r) => (
                            <button key={r} onClick={() => setUserRoleFilter(r)} className={`px-2.5 py-1 text-[11px] font-semibold rounded-md border transition ${userRoleFilter === r ? "bg-primary text-white border-primary" : "bg-white text-gray-600 border-gray-200 hover:border-primary/50"}`}>{r}</button>
                          ))}
                        </div>
                      </div>
                    )}

                    {activeTab === "users" && (
                      <div>
                        <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider flex justify-between"><span>Min performance score</span><span className="text-primary font-bold">{minScore}</span></label>
                        <input type="range" min={0} max={100} step={5} value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} className="w-full mt-2 accent-primary" />
                      </div>
                    )}

                    {activeTab === "daily" && (
                      <>
                        <div>
                          <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Worker</label>
                          <select
                            value={dailyUserFilter}
                            onChange={(e) => setDailyUserFilter(e.target.value)}
                            className="w-full mt-1.5 px-3 py-2 text-xs border border-gray-200 rounded-lg bg-white text-gray-900 focus:outline-none focus:border-primary"
                          >
                            <option value="all">All workers</option>
                            {dailyWorkers.map((worker) => (
                              <option key={worker.id} value={worker.id}>{worker.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Date from</label>
                          <input
                            type="date"
                            value={dailyDateFrom}
                            min={dailyRange.from}
                            max={dailyDateTo || dailyRange.to}
                            onChange={(e) => setDailyDateFrom(e.target.value)}
                            className="w-full mt-1.5 px-3 py-2 text-xs border border-gray-200 rounded-lg bg-white text-gray-900 focus:outline-none focus:border-primary"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Date to</label>
                          <input
                            type="date"
                            value={dailyDateTo}
                            min={dailyDateFrom || dailyRange.from}
                            max={dailyRange.to}
                            onChange={(e) => setDailyDateTo(e.target.value)}
                            className="w-full mt-1.5 px-3 py-2 text-xs border border-gray-200 rounded-lg bg-white text-gray-900 focus:outline-none focus:border-primary"
                          />
                        </div>
                      </>
                    )}

                  </div>
                  <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50">
                    <button onClick={resetFilters} className="text-xs font-semibold text-gray-500 hover:text-gray-900">Reset all</button>
                    <button onClick={() => setFilterOpen(false)} className="px-3 py-1.5 bg-primary hover:bg-primary/90 text-white text-xs font-semibold rounded-lg">Apply</button>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Tabs */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="flex border-b border-gray-100 overflow-x-auto">
          {ACTIVE_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`relative flex items-center gap-2 px-6 py-4 text-sm font-medium whitespace-nowrap transition-colors ${active ? "text-primary" : "text-gray-500 hover:text-gray-900"}`}>
                <Icon size={15} />
                {tab.label}
                {active && <motion.div layoutId="reportTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" transition={{ type: "spring", stiffness: 300, damping: 25 }} />}
              </button>
            );
          })}
        </div>

        <div className="p-6 min-h-[400px]">
          <AnimatePresence mode="wait">
            <motion.div key={activeTab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.25 }}>
              {activeTab === "progress" && isUser && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[
                      { label: "Completed Jobs", value: userPerformance.find(u => u.id === currentUser?.id)?.completed ?? 0, icon: CheckCircle2, color: "emerald" },
                      { label: "Hours Logged", value: formatDurationSeconds(userPerformance.find(u => u.id === currentUser?.id)?.hours ?? 0), icon: Clock, color: "amber" },
                      { label: "Performance Score", value: userPerformance.find(u => u.id === currentUser?.id)?.score ?? 0, icon: TrendingUp, color: "primary" },
                    ].map(k => (
                      <div key={k.label} className="p-5 rounded-2xl border border-gray-100 bg-white">
                        <div className={`w-10 h-10 rounded-xl bg-${k.color}-50 text-${k.color}-600 flex items-center justify-center mb-3`}><k.icon size={20} /></div>
                        <div className="text-2xl font-bold text-gray-900">{k.value}</div>
                        <div className="text-xs text-gray-500 font-medium uppercase tracking-wider">{k.label}</div>
                      </div>
                    ))}
                  </div>
                  <div className="bg-white rounded-2xl border border-gray-100 p-5">
                    <h4 className="font-bold text-gray-900 mb-4">Recent Job Progress</h4>
                    <div className="space-y-4">
                      {(apiJobs ?? []).filter(j => j.assignee?.id === currentUser?.id).slice(0, 5).map(j => (
                        <div key={j.id} className="space-y-2">
                          <div className="flex justify-between text-xs font-medium">
                            <span className="text-gray-700">{j.title}</span>
                            <span className="text-primary">{j.progress}%</span>
                          </div>
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-primary" style={{ width: `${j.progress}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "summary" && isUser && (
                <div className="space-y-6">
                   <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                    <div className="p-5 border-b border-gray-100">
                      <h4 className="font-bold text-gray-900">Work Summary History</h4>
                    </div>
                    <div className="divide-y divide-gray-50">
                      {(apiTimeLogs ?? []).filter(l => l.userId === currentUser?.id).slice(0, 10).map(l => (
                        <div key={l.id} className="p-4 flex items-center justify-between">
                          <div>
                            <div className="text-sm font-semibold text-gray-900">Time Log</div>
                            <div className="text-xs text-gray-500">{new Date(l.createdAt).toLocaleDateString()}</div>
                          </div>
                          <div className="text-sm font-bold text-gray-900">{formatDurationSeconds(l.duration ?? 0)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "system" && !isUser && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                  {systemMetrics.map((m, i) => (
                    <motion.div
                      key={m.label}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 + i * 0.05 }}
                      whileHover={{ y: -3 }}
                      className="bg-white p-5 rounded-2xl border border-gray-100 relative overflow-hidden group"
                    >
                      <div className="relative z-10">
                        <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">{m.label}</div>
                        <div className="text-3xl font-bold text-gray-900 mb-1">{m.value}</div>
                        <div className={`flex items-center gap-1 text-xs font-bold ${m.trend === "up" ? "text-emerald-600" : "text-red-600"}`}>
                          {m.change} {m.trend === "up" ? "↑" : "↓"}
                        </div>
                      </div>
                      <div className="absolute -bottom-4 -right-4 w-20 h-20 bg-gray-50 rounded-full group-hover:scale-150 transition-transform duration-500" />
                    </motion.div>
                  ))}
                </div>
              )}

              {activeTab === "users" && !isUser && (
                <div className="space-y-5">
                  {/* Header with role filter */}
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div>
                      <h3 className="text-base font-bold text-gray-900 flex items-center gap-2"><Users size={16} className="text-primary" /> Reports of all users</h3>
                      <p className="text-[11px] text-gray-500 mt-0.5">Per-user performance across the entire platform · {filteredUsers.length} {userRoleFilter === "All" ? "users" : userRoleFilter.toLowerCase() + "s"}</p>
                    </div>
                    <div className="flex gap-1 bg-gray-100 p-1 rounded-xl flex-wrap">
                      {ROLE_FILTERS.map((r) => (
                        <motion.button key={r} whileTap={{ scale: 0.96 }} onClick={() => setUserRoleFilter(r)} className={`relative px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${userRoleFilter === r ? "text-white" : "text-gray-600 hover:text-gray-900"}`}>
                          {userRoleFilter === r && <motion.div layoutId="userRoleBg" className="absolute inset-0 bg-primary rounded-lg pointer-events-none" transition={{ type: "spring", stiffness: 300, damping: 25 }} />}
                          <span className="relative">{r}</span>
                        </motion.button>
                      ))}
                    </div>
                  </div>

                  {/* Summary KPIs */}
                  <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                    {[
                      { label: "Total jobs", value: totalJobs, icon: FileText, color: "primary" },
                      { label: "Completed", value: totalCompleted, icon: TrendingUp, color: "emerald" },
                      { label: "Hours logged", value: formatDurationSeconds(totalLoggedSeconds), icon: Clock, color: "amber" },
                      { label: "Internal rework", value: totalReworkInternal, icon: AlertTriangle, color: "indigo" },
                      { label: "External rework", value: totalReworkExternal, icon: AlertTriangle, color: "red" },
                    ].map((k, i) => {
                      const Icon = k.icon;
                      return (
                        <motion.div key={k.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className="p-4 rounded-xl border border-gray-100 bg-gray-50/50">
                          <div className={`w-8 h-8 rounded-lg bg-${k.color}-50 text-${k.color}-600 flex items-center justify-center mb-2`}><Icon size={14} /></div>
                          <div className="text-xl font-bold text-gray-900">{k.value}</div>
                          <div className="text-[11px] text-gray-500">{k.label}</div>
                        </motion.div>
                      );
                    })}
                  </div>

                  {/* Per-user table */}
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 rounded-lg">
                        <tr>{["User", "Role", "Jobs", "Completed", "Hours", "Internal rework", "External rework", "Overdue", "Score", "Avg time", "Report"].map((h) => (
                          <th
                            key={h}
                            title={
                              h === "Internal rework"
                                ? "Admin/super-admin internal rework cases in this period"
                                : h === "External rework"
                                  ? "Admin/super-admin external rework cases in this period"
                                  : h === "Score"
                                    ? "Score out of 100: Completion (60) + On-time (25) + Low rework (15)"
                                    : h === "Avg time"
                                      ? "Average time from job assigned to job completed (not timer hours)"
                                      : undefined
                            }
                            className="text-left px-3 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider"
                          >
                            {h}
                          </th>
                        ))}</tr>
                      </thead>
                      <tbody>
                        {usersP.pageItems.map((u, i) => {
                          const badge = roleBadgeFor(u.role);
                          const Icon = badge.icon;
                          return (
                            <motion.tr key={u.name} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }} className="border-t border-gray-50 hover:bg-gray-50/60">
                              <td className="px-3 py-3.5">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-sky-700 text-white text-xs font-bold flex items-center justify-center">
                                    {u.name.split(" ").map((s) => s[0]).join("")}
                                  </div>
                                  <span className="text-sm font-medium text-gray-900 whitespace-nowrap">{u.name}</span>
                                </div>
                              </td>
                              <td className="px-3 py-3.5">
                                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[11px] font-semibold ${badge.bg} ${badge.color}`}>
                                  <Icon size={10} /> {u.role}
                                </span>
                              </td>
                              <td className="px-3 py-3.5 text-sm text-gray-700 tabular-nums">{u.jobs}</td>
                              <td className="px-3 py-3.5 text-sm text-emerald-700 font-semibold tabular-nums">{u.completed}</td>
                              <td className="px-3 py-3.5 text-sm text-gray-700 tabular-nums">{formatDurationSeconds(u.hours)}</td>
                              <td className="px-3 py-3.5 text-sm tabular-nums">
                                <span className={reworkCountClass(u.reworkInternal)}>{u.reworkInternal}</span>
                              </td>
                              <td className="px-3 py-3.5 text-sm tabular-nums">
                                <span className={reworkCountClass(u.reworkExternal)}>{u.reworkExternal}</span>
                              </td>
                              <td className="px-3 py-3.5 text-sm tabular-nums">
                                <span className={u.overdue > 0 ? "text-red-600 font-semibold" : "text-gray-400"}>{u.overdue}</span>
                              </td>
                              <td className="px-3 py-3.5">
                                {u.jobs === 0 ? (
                                  <span className="text-xs text-gray-400">—</span>
                                ) : (
                                  <div className="flex items-center gap-2 w-28" title={u.scoreTip}>
                                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                      <motion.div initial={{ width: 0 }} animate={{ width: `${u.score}%` }} transition={{ duration: 0.8, delay: i * 0.05 }} className={`h-full rounded-full ${u.score >= 90 ? "bg-emerald-500" : u.score >= 80 ? "bg-primary" : "bg-amber-500"}`} />
                                    </div>
                                    <span className="text-xs font-semibold text-gray-700">{u.score}</span>
                                  </div>
                                )}
                              </td>
                              <td className="px-3 py-3.5 text-sm text-gray-700 whitespace-nowrap">{u.avg}</td>
                              <td className="px-3 py-3.5">
                                <div className="flex items-center gap-1.5">
                                  <motion.button
                                    whileHover={{ y: -1, scale: 1.04 }}
                                    whileTap={{ scale: 0.94 }}
                                    onClick={() => void previewUserReport(u)}
                                    disabled={userReportPreviewLoading}
                                    title={`Preview ${u.name}'s report`}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-[11px] font-semibold transition-colors whitespace-nowrap disabled:opacity-50"
                                  >
                                    <Eye size={11} /> Preview
                                  </motion.button>
                                  <motion.button
                                    whileHover={{ y: -1, scale: 1.04 }}
                                    whileTap={{ scale: 0.94 }}
                                    onClick={() => void exportUserPDF(u)}
                                    title={`Download ${u.name}'s report as PDF`}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-primary/10 hover:bg-primary hover:text-white text-primary rounded-lg text-[11px] font-semibold transition-colors whitespace-nowrap"
                                  >
                                    <Download size={11} /> PDF
                                  </motion.button>
                                </div>
                              </td>
                            </motion.tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {filteredUsers.length === 0 && <div className="text-center py-8 text-sm text-gray-400">No users in this role.</div>}
                  </div>
                  <Pagination page={usersP.page} totalPages={usersP.totalPages} total={usersP.total} pageSize={usersP.pageSize} onChange={usersP.setPage} label="users" />
                </div>
              )}

              {activeTab === "time" && !isUser && (
                <div className="rounded-xl border border-gray-100 overflow-hidden">
                <table className="w-full">
                  <thead><tr>{["User", "Project", "Hours"].map((h) => <th key={h} className="text-left px-4 pt-3 pb-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider bg-gray-50/80">{h}</th>)}</tr></thead>
                  <tbody>
                    {!logsLoading && filteredTime.length === 0 && (
                      <tr>
                        <td colSpan={3} className="py-10 text-center text-sm text-gray-400">
                          No time logs yet. Start a timer and press Stop to save a log.
                        </td>
                      </tr>
                    )}
                    {timeP.pageItems.map((t, i) => (
                      <motion.tr key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }} className="border-t border-gray-50 hover:bg-gray-50">
                        <td className="px-4 py-3.5 text-sm font-medium text-gray-900">{t.user}</td>
                        <td className="px-4 py-3.5 text-sm text-gray-700">{t.project}</td>
                        <td className="px-4 py-3.5 text-sm font-semibold text-gray-900">{formatDurationSeconds(t.seconds)}</td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
                <Pagination page={timeP.page} totalPages={timeP.totalPages} total={timeP.total} pageSize={timeP.pageSize} onChange={timeP.setPage} label="entries" />
                </div>
              )}

              {activeTab === "daily" && canViewDailyReport && (
                <div className="space-y-5">
                  <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-4">
                    <div>
                      <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                        <CalendarDays size={16} className="text-primary" /> Daily worker time
                      </h3>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">From</label>
                      <input
                        type="date"
                        value={dailyDateFrom}
                        min={dailyRange.from}
                        max={dailyDateTo || dailyRange.to}
                        onChange={(e) => setDailyDateFrom(e.target.value)}
                        className="px-2.5 py-2 text-xs border border-gray-200 rounded-xl bg-white text-gray-900 focus:outline-none focus:border-primary"
                      />
                      <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">To</label>
                      <input
                        type="date"
                        value={dailyDateTo}
                        min={dailyDateFrom || dailyRange.from}
                        max={dailyRange.to}
                        onChange={(e) => setDailyDateTo(e.target.value)}
                        className="px-2.5 py-2 text-xs border border-gray-200 rounded-xl bg-white text-gray-900 focus:outline-none focus:border-primary"
                      />
                      {(dailyDateFrom || dailyDateTo) && (
                        <button
                          type="button"
                          onClick={() => {
                            setDailyDateFrom("");
                            setDailyDateTo("");
                          }}
                          className="px-2.5 py-2 text-xs font-semibold text-gray-500 hover:text-gray-900"
                        >
                          Clear dates
                        </button>
                      )}
                      <select
                        value={dailyUserFilter}
                        onChange={(e) => setDailyUserFilter(e.target.value)}
                        className="px-3 py-2 text-xs border border-gray-200 rounded-xl bg-white text-gray-900 focus:outline-none focus:border-primary min-w-[180px]"
                      >
                        <option value="all">All workers</option>
                        {dailyWorkers.map((worker) => (
                          <option key={worker.id} value={worker.id}>{worker.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {[
                      { label: "Total hours", value: formatDurationSeconds(dailySummary.totalSeconds), icon: Clock, color: "amber" },
                      { label: "Workers", value: dailySummary.uniqueWorkers, icon: Users, color: "primary" },
                      { label: "Days with logs", value: dailySummary.uniqueDays, icon: CalendarDays, color: "emerald" },
                      { label: "Sessions", value: dailySummary.totalSessions, icon: TrendingUp, color: "red" },
                    ].map((k, i) => {
                      const Icon = k.icon;
                      return (
                        <motion.div key={k.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className="p-4 rounded-xl border border-gray-100 bg-gray-50/50">
                          <div className={`w-8 h-8 rounded-lg bg-${k.color}-50 text-${k.color}-600 flex items-center justify-center mb-2`}><Icon size={14} /></div>
                          <div className="text-xl font-bold text-gray-900">{k.value}</div>
                          <div className="text-[11px] text-gray-500">{k.label}</div>
                        </motion.div>
                      );
                    })}
                  </div>

                  {dailyUserFilter !== "all" && (
                    <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
                      <div className="px-5 py-4 border-b border-gray-100">
                        <h4 className="font-bold text-gray-900">Daily hours trend</h4>
                      </div>
                      {dailyChartRows.length === 0 ? (
                        <div className="p-8 text-center text-sm text-gray-400">
                          No daily hours for the selected date range.
                        </div>
                      ) : (
                        <>
                          <div className="p-5 space-y-3">
                            {dailyChartP.pageItems.map((row) => {
                              const widthPct = dailyChartMaxSeconds > 0
                                ? Math.max(4, Math.round((row.totalSeconds / dailyChartMaxSeconds) * 100))
                                : 0;
                              return (
                                <div key={`${row.userId}-${row.date}`} className="grid grid-cols-[120px_1fr_80px] items-center gap-3">
                                  <span className="text-xs text-gray-600">{formatDisplayDate(row.date)}</span>
                                  <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                                    <div className="h-full bg-primary rounded-full" style={{ width: `${widthPct}%` }} />
                                  </div>
                                  <span className="text-xs font-semibold text-gray-900 text-right tabular-nums">
                                    {formatDurationSeconds(row.totalSeconds)}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                          <Pagination
                            page={dailyChartP.page}
                            totalPages={dailyChartP.totalPages}
                            total={dailyChartP.total}
                            pageSize={dailyChartP.pageSize}
                            onChange={dailyChartP.setPage}
                            label="days"
                          />
                        </>
                      )}
                    </div>
                  )}

                  {filteredDailyTotals.length > 0 && dailyUserFilter === "all" && (
                    <div className="rounded-xl border border-gray-100 overflow-hidden">
                      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/80">
                        <h4 className="text-sm font-bold text-gray-900">Per-worker totals</h4>
                      </div>
                      <table className="w-full">
                        <thead>
                          <tr>
                            {["Worker", "Role", "Days", "Hours", "Jobs", "Sessions"].map((h) => (
                              <th key={h} className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {dailyTotalsP.pageItems.map((total) => {
                              const badge = roleBadgeFor(userRoleLabelFromApi(total.userRole));
                              const Icon = badge.icon;
                              return (
                                <tr key={total.userId} className="border-t border-gray-50 hover:bg-gray-50/60">
                                  <td className="px-4 py-3.5 text-sm font-medium text-gray-900">{total.userName}</td>
                                  <td className="px-4 py-3.5">
                                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[11px] font-semibold ${badge.bg} ${badge.color}`}>
                                      <Icon size={10} /> {USER_ROLE_LABEL[total.userRole] ?? total.userRole}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3.5 text-sm text-gray-700 tabular-nums">{total.daysWorked}</td>
                                  <td className="px-4 py-3.5 text-sm font-semibold text-gray-900 tabular-nums">{formatDurationSeconds(total.totalSeconds)}</td>
                                  <td className="px-4 py-3.5 text-sm text-gray-700 tabular-nums">{total.jobCount}</td>
                                  <td className="px-4 py-3.5 text-sm text-gray-700 tabular-nums">{total.sessionCount}</td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                      <Pagination
                        page={dailyTotalsP.page}
                        totalPages={dailyTotalsP.totalPages}
                        total={dailyTotalsP.total}
                        pageSize={dailyTotalsP.pageSize}
                        onChange={dailyTotalsP.setPage}
                        label="workers"
                      />
                    </div>
                  )}

                  <div className="rounded-xl border border-gray-100 overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/80">
                      <h4 className="text-sm font-bold text-gray-900">Daily breakdown</h4>
                    </div>
                    <table className="w-full">
                      <thead>
                        <tr>
                          {["Date", "Worker", "Role", "Hours", "Jobs", "Sessions"].map((h) => (
                            <th key={h} className="text-left px-4 pt-3 pb-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider bg-gray-50/80">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {dailyLoading && (
                          <tr>
                            <td colSpan={6} className="py-10 text-center text-sm text-gray-400">Loading daily time report…</td>
                          </tr>
                        )}
                        {!dailyLoading && filteredDailyRows.length === 0 && (
                          <tr>
                            <td colSpan={6} className="py-10 text-center text-sm text-gray-400">
                              No time logged for this period. Start a timer and press Stop to create logs.
                            </td>
                          </tr>
                        )}
                        {!dailyLoading && dailyP.pageItems.map((row, i) => {
                          const badge = roleBadgeFor(userRoleLabelFromApi(row.userRole));
                          const Icon = badge.icon;
                          return (
                            <motion.tr key={`${row.userId}-${row.date}`} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }} className="border-t border-gray-50 hover:bg-gray-50">
                              <td className="px-4 py-3.5 text-sm text-gray-700 whitespace-nowrap">{formatDisplayDate(row.date)}</td>
                              <td className="px-4 py-3.5 text-sm font-medium text-gray-900">{row.userName}</td>
                              <td className="px-4 py-3.5">
                                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[11px] font-semibold ${badge.bg} ${badge.color}`}>
                                  <Icon size={10} /> {USER_ROLE_LABEL[row.userRole] ?? row.userRole}
                                </span>
                              </td>
                              <td className="px-4 py-3.5 text-sm font-semibold text-gray-900 tabular-nums">{formatDurationSeconds(row.totalSeconds)}</td>
                              <td className="px-4 py-3.5 text-sm text-gray-700 tabular-nums">{row.jobCount}</td>
                              <td className="px-4 py-3.5 text-sm text-gray-700 tabular-nums">{row.sessionCount}</td>
                            </motion.tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <Pagination page={dailyP.page} totalPages={dailyP.totalPages} total={dailyP.total} pageSize={dailyP.pageSize} onChange={dailyP.setPage} label="entries" />
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <Dialog open={!!userReportPreview} onOpenChange={(open) => { if (!open) setUserReportPreview(null); }}>
        <DialogContent className="max-w-5xl w-[95vw] h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 py-4 border-b border-gray-100 shrink-0">
            <DialogTitle>{userReportPreview ? `${userReportPreview.user.name} — Performance Report` : "Performance report preview"}</DialogTitle>
            <DialogDescription>
              Review the report before saving or printing as PDF.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 bg-gray-100">
            {userReportPreview && (
              <iframe
                title={userReportPreview ? `${userReportPreview.user.name} report preview` : "Report preview"}
                srcDoc={userReportPreview.html}
                className="w-full h-full border-0 bg-white"
              />
            )}
          </div>
          <DialogFooter className="px-6 py-4 border-t border-gray-100 shrink-0 gap-2 sm:gap-2">
            <button
              type="button"
              onClick={() => setUserReportPreview(null)}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => void printPreviewedUserReport()}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary/90 rounded-xl"
            >
              <Download size={14} /> Save as PDF
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </DashboardLayout>
  );
}
