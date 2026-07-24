import { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Users, Briefcase, Activity, AlertTriangle, ArrowUpRight, ArrowDownRight,
  Plus, UserPlus, FileText, Clock,
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import Pagination, { usePagination } from "@/components/Pagination";
import { useGetDashboardStats, useListJobs, useListUsers, type User } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";

const QUICK_ACTIONS = [
  { label: "Add User", icon: UserPlus, href: "/super-admin/users", color: "bg-emerald-600" },
  { label: "Job Overview", icon: Plus, href: "/super-admin/jobs", color: "bg-primary" },
  { label: "Supervisor Oversight", icon: Activity, href: "/super-admin/supervisors", color: "bg-violet-600" },
  { label: "Generate Report", icon: FileText, href: "/super-admin/reports", color: "bg-amber-600" },
];

function Counter({ value }: { value: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf: number;
    const start = performance.now();
    const dur = 600;
    const step = (now: number) => {
      const p = Math.min((now - start) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(Math.round(value * eased));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{n.toLocaleString()}</>;
}

export default function SuperAdminDashboard() {
  const { user } = useAuth();
  const { data: dashboardData, isLoading } = useGetDashboardStats();
  const { data: apiJobs } = useListJobs();
  const { data: apiUsers } = useListUsers();
  const showSkeleton = isLoading && !dashboardData;

  const parseMs = (iso: string | null | undefined) => {
    if (!iso) return null;
    const ms = new Date(iso).getTime();
    return Number.isFinite(ms) ? ms : null;
  };

  const pctChange = (current: number, previous: number) => {
    if (!Number.isFinite(current) || !Number.isFinite(previous)) return 0;
    if (previous <= 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
  };

  const performance = useMemo(() => {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const last7Days: Array<{ key: string; day: string; dateLabel: string; created: number; completed: number }> = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const dayName = days[d.getDay()];
      const dateLabel = String(d.getDate()).padStart(2, "0");
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${dateLabel}`;
      const startOfDay = d.getTime();
      const endOfDay = startOfDay + 24 * 60 * 60 * 1000;
      
      const createdInDay = (apiJobs ?? []).filter(j => {
        const created = new Date(j.createdAt).getTime();
        return created >= startOfDay && created < endOfDay;
      }).length;
      
      const completedInDay = (apiJobs ?? []).filter(j => {
        if (j.status !== 'completed' || !j.completedAt) return false;
        const completed = new Date(j.completedAt).getTime();
        return completed >= startOfDay && completed < endOfDay;
      }).length;
      
      last7Days.push({ key, day: dayName, dateLabel, created: createdInDay, completed: completedInDay });
    }
    return last7Days;
  }, [apiJobs]);

  const maxCount = Math.max(...performance.map((d) => Math.max(d.created, d.completed)), 1);
  const hasAnyPerformanceData = performance.some((d) => d.created > 0 || d.completed > 0);

  const stats = useMemo(() => {
    const nowMs = Date.now();
    const prevMs = nowMs - 7 * 24 * 60 * 60 * 1000;

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

    const totalUsers = dashboardData?.stats.totalUsers ?? 0;
    const totalJobs = dashboardData?.stats.totalJobs ?? 0;
    const activeJobs = dashboardData?.stats.activeJobs ?? 0;
    const overdueJobs = dashboardData?.stats.overdueJobs ?? 0;
    const dueToday = (dashboardData?.stats as any)?.dueToday ?? 0;

    const usersChange = pctChange(totalUsers, usersPrev);
    const jobsChange = pctChange(totalJobs, jobsPrev);
    const activeChange = pctChange(activeJobs, activePrev);
    const overdueChange = pctChange(overdueJobs, overduePrev);

    return [
      { label: "Total Users", value: totalUsers, change: Math.abs(usersChange), trend: usersChange >= 0 ? "up" as const : "down" as const, icon: Users, color: "from-primary to-sky-700", iconBg: "bg-primary/10", iconText: "text-primary" },
      { label: "Total Jobs", value: totalJobs, change: Math.abs(jobsChange), trend: jobsChange >= 0 ? "up" as const : "down" as const, icon: Briefcase, color: "from-emerald-500 to-emerald-700", iconBg: "bg-emerald-50", iconText: "text-emerald-600" },
      { label: "Due Today", value: dueToday, change: 0, trend: "up" as const, icon: Clock, color: "from-purple-500 to-purple-700", iconBg: "bg-purple-50", iconText: "text-purple-600" },
      { label: "Overdue Jobs", value: overdueJobs, change: Math.abs(overdueChange), trend: overdueJobs <= overduePrev ? "up" as const : "down" as const, icon: AlertTriangle, color: "from-red-500 to-rose-700", iconBg: "bg-red-50", iconText: "text-red-600" },
    ];
  }, [dashboardData, apiJobs, apiUsers]);

  const recentActivity = useMemo(() => dashboardData?.recentJobs.map(job => ({
    user: job.client,
    action: "was updated",
    target: job.title,
    time: new Date(job.updatedAt).toLocaleTimeString(),
    color: "bg-primary"
  })) ?? [], [dashboardData]);

  const activityP = usePagination(recentActivity, 6);

  return (
    <DashboardLayout title="Dashboard Overview">
      {/* Welcome banner */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="relative overflow-hidden bg-gradient-to-br from-black via-gray-900 to-black rounded-2xl p-7 mb-8 border border-gray-800"
      >
        <motion.div
          className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-primary/20 blur-3xl"
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ duration: 6, repeat: Infinity }}
        />
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-white">Welcome back, {user?.name?.split(" ")[0] ?? "Admin"} 👋</h2>
            <p className="text-gray-400 text-sm">Here's what's happening across your organization today.</p>
          </div>
          <div className="flex items-center gap-2">
            <motion.div
              className="w-2 h-2 rounded-full bg-green-400"
              animate={{ scale: [1, 1.4, 1], opacity: [1, 0.5, 1] }}
              transition={{ duration: 1.8, repeat: Infinity }}
            />
            <span className="text-xs text-gray-300 font-medium">All systems operational</span>
          </div>
        </div>
      </motion.div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        {stats.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.04 }}
              whileHover={{ y: -4, boxShadow: "0 20px 40px rgba(0,0,0,0.08)" }}
              className="relative bg-white rounded-2xl p-6 border border-gray-100 cursor-pointer overflow-hidden group"
            >
              <div className={`absolute top-0 right-0 w-32 h-32 rounded-full bg-gradient-to-br ${stat.color} opacity-5 group-hover:opacity-10 transition-opacity blur-2xl`} />
              <div className="relative z-10">
                <div className="flex items-start justify-between mb-4">
                  <div className={`w-11 h-11 rounded-xl ${stat.iconBg} ${stat.iconText} flex items-center justify-center`}>
                    <Icon size={20} />
                  </div>
                  <span className={`flex items-center gap-1 text-xs font-semibold ${stat.trend === "up" ? "text-emerald-600 bg-emerald-50" : "text-red-600 bg-red-50"} px-2 py-1 rounded-full`}>
                    {stat.trend === "up" ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                    {stat.change}%
                  </span>
                </div>
                <div className="text-3xl font-bold text-gray-900 mb-1">
                  {showSkeleton ? (
                    <div className="h-8 w-16 bg-gray-100 rounded animate-pulse" />
                  ) : (
                    <Counter value={stat.value} />
                  )}
                </div>
                <div className="text-sm text-gray-500">{stat.label}</div>
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Performance chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="lg:col-span-2 bg-white rounded-2xl p-6 border border-gray-100"
        >
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-bold text-gray-900">Weekly Performance</h3>
              <p className="text-xs text-gray-500 mt-0.5">Jobs created vs completed</p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-primary" />
                <span className="text-gray-600 font-medium">Created</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-emerald-500" />
                <span className="text-gray-600 font-medium">Completed</span>
              </div>
            </div>
          </div>
          <div className="h-56">
            {!hasAnyPerformanceData ? (
              <div className="h-full flex items-center justify-center text-sm text-gray-400">
                No jobs created or completed in the last 7 days
              </div>
            ) : (
              <div className="flex items-stretch justify-between gap-3 h-full">
                {performance.map((d, i) => (
                  <div key={d.key} className="flex-1 flex flex-col items-center gap-2 group h-full relative">
                    <div className="absolute -top-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                      <div className="bg-black text-white text-[10px] px-2 py-1 rounded whitespace-nowrap font-semibold">
                        {d.day} {d.dateLabel} · Created {d.created} · Completed {d.completed}
                      </div>
                    </div>
                    <div className="w-full flex items-end justify-center gap-1 flex-1">
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: `${(d.created / maxCount) * 100}%` }}
                        transition={{ duration: 0.45, delay: 0.25 + i * 0.03, ease: "easeOut" }}
                        className="w-1/2 bg-gradient-to-t from-primary to-sky-400 rounded-t-lg origin-bottom"
                      />
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: `${(d.completed / maxCount) * 100}%` }}
                        transition={{ duration: 0.45, delay: 0.3 + i * 0.03, ease: "easeOut" }}
                        className="w-1/2 bg-gradient-to-t from-emerald-500 to-emerald-300 rounded-t-lg origin-bottom"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-gray-500 font-medium">{d.day}</span>
                      <span className="text-[10px] text-gray-400">{d.dateLabel}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>

        {/* Quick actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-2xl p-6 border border-gray-100"
        >
          <h3 className="font-bold text-gray-900 mb-1">Quick Actions</h3>
          <p className="text-xs text-gray-500 mb-5">Jump straight to key tasks</p>
          <div className="space-y-3">
            {QUICK_ACTIONS.map((action, i) => {
              const Icon = action.icon;
              return (
                <motion.a
                  key={action.label}
                  href={action.href}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4 + i * 0.04 }}
                  whileHover={{ x: 4, scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl bg-gray-50 hover:bg-white hover:shadow-md border border-transparent hover:border-gray-200 transition-all cursor-pointer group"
                >
                  <div className={`w-9 h-9 rounded-lg ${action.color} text-white flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform`}>
                    <Icon size={16} />
                  </div>
                  <span className="text-sm font-medium text-gray-700 flex-1">{action.label}</span>
                  <ArrowUpRight size={14} className="text-gray-400 group-hover:text-primary transition-colors" />
                </motion.a>
              );
            })}
          </div>
        </motion.div>
      </div>

      {/* Activity feed */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="bg-white rounded-2xl p-6 border border-gray-100"
      >
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-bold text-gray-900">Recent Activity</h3>
            <p className="text-xs text-gray-500 mt-0.5">Latest events across the platform</p>
          </div>
          <button className="text-xs font-medium text-primary hover:underline">View all</button>
        </div>
        <div className="space-y-1">
          {activityP.pageItems.map((a, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5 + i * 0.04 }}
              whileHover={{ x: 4, backgroundColor: "rgb(249, 250, 251)" }}
              className="flex items-center gap-4 p-3 rounded-xl cursor-pointer transition-colors"
            >
              <div className="relative shrink-0">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center text-xs font-bold text-gray-700">
                  {a.user.split(" ").map((s) => s[0]).join("").slice(0, 2)}
                </div>
                <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ${a.color} border-2 border-white`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-700 truncate">
                  <span className="font-semibold text-gray-900">{a.user}</span>{" "}
                  <span className="text-gray-500">{a.action}</span>{" "}
                  <span className="font-medium text-primary">{a.target}</span>
                </p>
              </div>
              <span className="text-xs text-gray-400 shrink-0">{a.time}</span>
            </motion.div>
          ))}
        </div>
        <Pagination page={activityP.page} totalPages={activityP.totalPages} total={activityP.total} pageSize={activityP.pageSize} onChange={activityP.setPage} label="events" />
      </motion.div>
    </DashboardLayout>
  );
}
