import { useState, useMemo, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Activity, Users, Briefcase, AlertTriangle, CheckCircle2, Clock,
  Wifi, Server, Database, HardDrive, TrendingUp, TrendingDown, Eye, Search,
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import Pagination, { usePagination } from "@/components/Pagination";
import { useGetDashboardStats, useListUsers, useListJobs, type User } from "@workspace/api-client-react";
import type { Role } from "@/lib/roles";
import { formatPresenceLabel, getPresenceStatus } from "@/lib/presence";

type HealthStatus = "healthy" | "degraded" | "down";

type ServiceHealth = {
  id: string;
  name: string;
  status: HealthStatus;
  detail: string;
  latencyMs: number | null;
  checkedAt: string;
};

type SystemHealthResponse = {
  overall: HealthStatus;
  summary: string;
  checkedAt: string;
  services: ServiceHealth[];
};

const SERVICE_ICONS: Record<string, typeof Server> = {
  api_server: Server,
  database: Database,
  file_storage: HardDrive,
  cliq_sync: Wifi,
};

const STATUS_COLOR: Record<string, { dot: string; text: string; bg: string }> = {
  Active: { dot: "bg-emerald-500", text: "text-emerald-700", bg: "bg-emerald-50" },
  "On Job": { dot: "bg-primary", text: "text-primary", bg: "bg-primary/10" },
  Idle: { dot: "bg-gray-400", text: "text-gray-600", bg: "bg-gray-100" },
};

function parseMs(iso: string | null | undefined) {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function inWindow(iso: string | null | undefined, start: number, end: number) {
  const ms = parseMs(iso);
  return ms != null && ms >= start && ms < end;
}

function formatCountDelta(delta: number, lowerIsBetter = false) {
  if (delta === 0) return { change: "0", trend: "neutral" as const };
  const trend = lowerIsBetter ? (delta < 0 ? "up" : "down") : delta > 0 ? "up" : "down";
  const sign = delta > 0 ? "+" : "";
  return { change: `${sign}${delta}`, trend };
}

function formatPctDelta(current: number, previous: number, lowerIsBetter = false) {
  if (previous <= 0 && current <= 0) return { change: "0%", trend: "neutral" as const };
  const pct = previous <= 0 ? 100 : Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return { change: "0%", trend: "neutral" as const };
  const trend = lowerIsBetter ? (pct < 0 ? "up" : "down") : pct > 0 ? "up" : "down";
  const sign = pct > 0 ? "+" : "";
  return { change: `${sign}${pct}%`, trend };
}

function formatAvgHours(hours: number) {
  if (!Number.isFinite(hours) || hours <= 0) return "—";
  if (hours >= 24) return `${(hours / 24).toFixed(1)}d`;
  return `${hours.toFixed(1)}h`;
}

const HEALTH_COLOR: Record<string, { dot: string; text: string; bg: string; ring: string }> = {
  healthy: { dot: "bg-emerald-500", text: "text-emerald-700", bg: "bg-emerald-50", ring: "ring-emerald-200" },
  degraded: { dot: "bg-amber-500", text: "text-amber-700", bg: "bg-amber-50", ring: "ring-amber-200" },
  down: { dot: "bg-red-500", text: "text-red-700", bg: "bg-red-50", ring: "ring-red-200" },
};

export default function SystemMonitoring({ role = "super-admin" as Role }: { role?: Role } = {}) {
  const { data: dashboardData } = useGetDashboardStats();
  const { data: apiUsers, isLoading: usersLoading } = useListUsers();
  const { data: apiJobs, isLoading: jobsLoading } = useListJobs();

  const [filter, setFilter] = useState<"All" | "Active" | "On Job" | "Idle">("All");
  const [search, setSearch] = useState("");
  const [systemHealth, setSystemHealth] = useState<SystemHealthResponse | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [healthError, setHealthError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadSystemHealth = async () => {
      setHealthError(null);
      try {
        const res = await fetch("/api/system/health", { credentials: "include" });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as any).error || "Failed to load system health");
        }
        const data = (await res.json()) as SystemHealthResponse;
        if (!cancelled) setSystemHealth(data);
      } catch (err) {
        if (!cancelled) {
          setHealthError(err instanceof Error ? err.message : "Failed to load system health");
        }
      } finally {
        if (!cancelled) setHealthLoading(false);
      }
    };

    void loadSystemHealth();
    const id = window.setInterval(() => void loadSystemHealth(), 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const kpis = useMemo(() => {
    const users = apiUsers ?? [];
    const jobs = apiJobs ?? [];
    const now = Date.now();
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const weekStart = now - weekMs;
    const prevWeekStart = now - 2 * weekMs;

    const activeUsers = users.filter((u) =>
      getPresenceStatus({
        accountStatus: u.status,
        lastSeenAt: u.lastSeenAt,
        lastSignInAt: u.lastSignInAt,
      }) === "online",
    ).length;
    const signInsThisWeek = users.filter((u) => inWindow(u.lastSignInAt as string, weekStart, now)).length;
    const signInsLastWeek = users.filter((u) => inWindow(u.lastSignInAt as string, prevWeekStart, weekStart)).length;
    const usersTrend = formatCountDelta(signInsThisWeek - signInsLastWeek);

    const activeJobs =
      dashboardData?.stats.activeJobs ?? jobs.filter((j) => j.status === "in_progress").length;
    const totalJobs = dashboardData?.stats.totalJobs ?? jobs.length;
    const inProgressThisWeek = jobs.filter(
      (j) => j.status === "in_progress" && inWindow(j.updatedAt as string, weekStart, now),
    ).length;
    const inProgressLastWeek = jobs.filter(
      (j) => j.status === "in_progress" && inWindow(j.updatedAt as string, prevWeekStart, weekStart),
    ).length;
    const activeTrend = formatCountDelta(inProgressThisWeek - inProgressLastWeek);

    const overdueJobs =
      dashboardData?.stats.overdueJobs ??
      jobs.filter((j) => {
        if (j.isOverdue) return true;
        const dueMs = parseMs(j.dueDate as string);
        return dueMs != null && dueMs < now && j.status !== "completed" && j.status !== "cancelled";
      }).length;
    const overdueWasLastWeek = jobs.filter((j) => {
      if (j.status === "completed" || j.status === "cancelled") {
        const completedMs = parseMs(j.completedAt as string);
        if (completedMs != null && completedMs < weekStart) return false;
      }
      const dueMs = parseMs(j.dueDate as string);
      return dueMs != null && dueMs < weekStart && j.status !== "completed" && j.status !== "cancelled";
    }).length;
    const overdueTrend = formatCountDelta(overdueJobs - overdueWasLastWeek, true);

    const avgHoursInWindow = (start: number, end: number) => {
      const samples = jobs
        .filter((j) => j.status === "completed")
        .filter((j) => inWindow(j.completedAt as string, start, end))
        .map((j) => {
          const createdMs = parseMs(j.createdAt as string);
          const completedMs = parseMs(j.completedAt as string);
          if (createdMs == null || completedMs == null || completedMs < createdMs) return null;
          return (completedMs - createdMs) / 36e5;
        })
        .filter((h): h is number => h != null);
      if (samples.length === 0) return 0;
      return samples.reduce((sum, h) => sum + h, 0) / samples.length;
    };

    const avgThisWeek = avgHoursInWindow(weekStart, now);
    const avgLastWeek = avgHoursInWindow(prevWeekStart, weekStart);
    const avgRecent = avgThisWeek > 0 ? avgThisWeek : avgLastWeek;
    const avgTrend = formatPctDelta(avgThisWeek, avgLastWeek, true);

    return [
      {
        label: "Active Users",
        value: activeUsers,
        total: users.length,
        ...usersTrend,
        icon: Users,
        color: "emerald",
        trendHint: "Sign-ins this week vs last week",
      },
      {
        label: "Active Jobs",
        value: activeJobs,
        total: totalJobs,
        ...activeTrend,
        icon: Briefcase,
        color: "primary",
        trendHint: "In-progress job activity vs last week",
      },
      {
        label: "Overdue Jobs",
        value: overdueJobs,
        total: totalJobs,
        ...overdueTrend,
        icon: AlertTriangle,
        color: "red",
        trendHint: "Overdue count vs 7 days ago (lower is better)",
      },
      {
        label: "Avg Response",
        value: formatAvgHours(avgRecent),
        ...avgTrend,
        icon: Clock,
        color: "amber",
        trendHint: "Avg job completion time this week vs last week",
      },
    ];
  }, [dashboardData, apiUsers, apiJobs]);

  const liveUsers = useMemo(() => (apiUsers ?? []).map((u: User) => {
    const presence = getPresenceStatus({
      accountStatus: u.status,
      lastSeenAt: u.lastSeenAt,
      lastSignInAt: u.lastSignInAt,
    });
    const seenAt = u.lastSeenAt ?? u.lastSignInAt;
    return {
      name: u.name,
      role: u.role.charAt(0).toUpperCase() + u.role.slice(1),
      status: presence === "online" ? "Active" : presence === "away" ? "Idle" : "Idle" as "Active" | "On Job" | "Idle",
      lastSeen: seenAt
        ? new Date(seenAt).toLocaleString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })
        : "Never",
      action: formatPresenceLabel(presence),
      avatar: u.name.split(" ").map(s => s[0]).join("").toUpperCase(),
      presence,
    };
  }), [apiUsers]);

  const activityFeed = useMemo(() => (apiJobs ?? []).slice(0, 10).map(j => ({
    type: "job",
    text: `Job ${j.number}: ${j.title}`,
    user: j.assignee?.name ?? "Unassigned",
    time: new Date(j.updatedAt).toLocaleTimeString(),
    color: j.status === 'completed' ? "emerald" : j.isOverdue ? "red" : "primary"
  })), [apiJobs]);

  const filtered = liveUsers.filter(
    (u) => (filter === "All" || u.status === filter) && u.name.toLowerCase().includes(search.toLowerCase())
  );
  const activityP = usePagination(activityFeed, 8);
  const usersP = usePagination(filtered, 8);

  const isLoading = usersLoading || jobsLoading;
  if (isLoading && !apiUsers) {
    return (
      <DashboardLayout title="System Monitoring" role={role}>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="System Monitoring" role={role}>
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {kpis.map((k, i) => {
          const Icon = k.icon;
          return (
            <motion.div
              key={k.label}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="bg-white rounded-2xl border border-gray-100 p-5"
            >
              <div className="flex items-center justify-between mb-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-${k.color}-50 text-${k.color}-600`}>
                  <Icon size={18} />
                </div>
                <span
                  title={(k as { trendHint?: string }).trendHint ?? "Change vs previous 7 days"}
                  className={`flex items-center gap-1 text-xs font-bold ${
                    k.trend === "neutral"
                      ? "text-gray-400"
                      : k.trend === "up"
                        ? "text-emerald-600"
                        : "text-red-500"
                  }`}
                >
                  {k.trend === "up" ? <TrendingUp size={12} /> : k.trend === "down" ? <TrendingDown size={12} /> : null}
                  {k.change}
                </span>
              </div>
              <div className="text-2xl font-bold text-gray-900">
                {k.value}
                {"total" in k && k.total != null ? (
                  <span className="text-sm font-normal text-gray-400"> / {k.total}</span>
                ) : null}
              </div>
              <div className="text-xs text-gray-500 mt-0.5">{k.label}</div>
            </motion.div>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-3 gap-6 mb-6">
        {/* System health */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="p-5 border-b border-gray-100 flex items-start justify-between gap-3">
            <div>
              <h3 className="font-bold text-gray-900 flex items-center gap-2"><Activity size={16} className="text-primary" /> System Health</h3>
              <p className="text-[11px] text-gray-500 mt-0.5">
                {healthLoading && !systemHealth
                  ? "Checking services…"
                  : healthError
                    ? healthError
                    : systemHealth?.summary ?? "Live service status"}
              </p>
            </div>
            <span className="text-[10px] font-medium text-gray-500 flex items-center gap-1.5 shrink-0 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Auto · 15s
            </span>
          </div>
          <div className="divide-y divide-gray-50">
            {healthLoading && !systemHealth ? (
              <div className="p-6 text-sm text-gray-400 text-center">Running live checks…</div>
            ) : healthError && !systemHealth ? (
              <div className="p-6 text-sm text-red-600 text-center">{healthError}</div>
            ) : (
              (systemHealth?.services ?? []).map((s) => {
                const Icon = SERVICE_ICONS[s.id] ?? Activity;
                const c = HEALTH_COLOR[s.status] ?? HEALTH_COLOR.healthy;
                return (
                  <div key={s.id} className="p-4 flex items-center gap-3 hover:bg-sky-50/60 transition-colors duration-150">
                    <div className={`w-9 h-9 rounded-lg ${c.bg} ${c.text} flex items-center justify-center`}><Icon size={16} /></div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-gray-900">{s.name}</div>
                      <div className="text-[11px] text-gray-500 truncate">{s.detail}</div>
                    </div>
                    <span className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide ${c.bg} ${c.text}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${c.dot} ${s.status === "healthy" ? "animate-pulse" : ""}`} />
                      {s.status}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </motion.div>

        {/* Activity feed */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="p-5 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-gray-900 flex items-center gap-2"><CheckCircle2 size={16} className="text-primary" /> System Activity</h3>
              <p className="text-[11px] text-gray-500 mt-0.5">Live feed across all users and jobs</p>
            </div>
            <span className="text-[10px] font-medium text-gray-500 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live
            </span>
          </div>
          <div className="max-h-[360px] overflow-y-auto">
            {activityP.pageItems.map((a, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                className="px-5 py-3.5 flex items-start gap-3 border-b border-gray-50 last:border-0 hover:bg-gray-50/50"
              >
                <div className={`mt-1 w-2 h-2 rounded-full bg-${a.color}-500 shrink-0`} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-gray-900">{a.text}</div>
                  <div className="text-[11px] text-gray-500 mt-0.5">{a.user} · {a.time}</div>
                </div>
              </motion.div>
            ))}
          </div>
          <Pagination page={activityP.page} totalPages={activityP.totalPages} total={activityP.total} pageSize={activityP.pageSize} onChange={activityP.setPage} label="events" />
        </motion.div>
      </div>

      {/* Live user table */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex flex-col md:flex-row gap-3 md:items-center justify-between">
          <div>
            <h3 className="font-bold text-gray-900 flex items-center gap-2"><Eye size={16} className="text-primary" /> Live User Activity</h3>
            <p className="text-[11px] text-gray-500 mt-0.5">Who's active right now and what they're doing</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
              <Search size={14} className="text-gray-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search users…" className="bg-transparent !text-gray-900 !placeholder:text-gray-400 text-sm focus:outline-none w-40" />
            </div>
            <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
              {(["All", "Active", "On Job", "Idle"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`relative px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${filter === f ? "text-white" : "text-gray-600 hover:text-gray-900"}`}
                >
                  {filter === f && <motion.div layoutId="monFilterBg" className="absolute inset-0 bg-primary rounded-lg" transition={{ type: "spring", stiffness: 300, damping: 25 }} />}
                  <span className="relative">{f}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {["User", "Role", "Status", "Current Activity", "Last Seen"].map((h) => (
                  <th key={h} className="text-left px-6 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {usersP.pageItems.map((u, i) => {
                const c = STATUS_COLOR[u.status];
                return (
                  <motion.tr
                    key={u.name}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60"
                  >
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-sky-700 text-white text-xs font-bold flex items-center justify-center">{u.avatar}</div>
                        <div className="text-sm font-medium text-gray-900">{u.name}</div>
                      </div>
                    </td>
                    <td className="px-6 py-3.5"><span className="text-xs font-semibold text-gray-600">{u.role}</span></td>
                    <td className="px-6 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${c.bg} ${c.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${c.dot} ${u.status !== "Idle" ? "animate-pulse" : ""}`} />
                        {u.status}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-sm text-gray-700">{u.action}</td>
                    <td className="px-6 py-3.5 text-xs text-gray-500">{u.lastSeen}</td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && <div className="text-center py-12 text-sm text-gray-400">No users match.</div>}
        </div>
        <Pagination page={usersP.page} totalPages={usersP.totalPages} total={usersP.total} pageSize={usersP.pageSize} onChange={usersP.setPage} label="users" />
      </motion.div>
    </DashboardLayout>
  );
}
