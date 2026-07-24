import { useMemo } from "react";
import { motion } from "framer-motion";
import { Link } from "wouter";
import {
  Briefcase, Users, CheckCircle2, Clock, ArrowUpRight, ArrowDownRight,
  Plus, UserPlus, FileText, TrendingUp,
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import Pagination, { usePagination } from "@/components/Pagination";
import { useGetDashboardStats, useListUsers, useListJobs, type User } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";

export default function AdminDashboard() {
  const { user: currentUser } = useAuth();
  const { data: dashboardData, isLoading } = useGetDashboardStats();
  const { data: apiUsers } = useListUsers();
  const { data: apiJobs } = useListJobs();
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

    const totalJobs = dashboardData?.stats.totalJobs ?? 0;
    const totalUsers = dashboardData?.stats.totalUsers ?? 0;
    const activeJobs = dashboardData?.stats.activeJobs ?? 0;
    const overdueJobs = dashboardData?.stats.overdueJobs ?? 0;
    const dueToday = (dashboardData?.stats as any)?.dueToday ?? 0;
    const waitingReview = (dashboardData?.stats as any)?.waitingReview ?? 0;

    const jobsChange = pctChange(totalJobs, jobsPrev);
    const usersChange = pctChange(totalUsers, usersPrev);
    const activeChange = pctChange(activeJobs, activePrev);
    const overdueChange = pctChange(overdueJobs, overduePrev);

    return [
      { label: "Total Jobs", value: totalJobs, icon: Briefcase, change: Math.abs(jobsChange), up: jobsChange >= 0, color: "from-primary to-sky-700", bg: "bg-primary/10", text: "text-primary" },
      { label: "Active Users", value: totalUsers, icon: Users, change: Math.abs(usersChange), up: usersChange >= 0, color: "from-emerald-500 to-emerald-700", bg: "bg-emerald-50", text: "text-emerald-600" },
      { label: "Due Today", value: dueToday, icon: Clock, change: 0, up: true, color: "from-purple-500 to-purple-700", bg: "bg-purple-50", text: "text-purple-600" },
      { label: "Overdue", value: overdueJobs, icon: Clock, change: Math.abs(overdueChange), up: overdueJobs <= overduePrev, color: "from-amber-500 to-orange-600", bg: "bg-amber-50", text: "text-amber-600" },
    ];
  }, [dashboardData, apiUsers, apiJobs]);

  const recentJobs = useMemo(() => (dashboardData?.recentJobs ?? []).map(j => ({
    id: j.number,
    client: j.client,
    supervisor: j.supervisor?.name ?? "Unassigned",
    status: j.status,
    color: "bg-primary/10 text-primary"
  })), [dashboardData]);

  const team = useMemo(() => (apiUsers ?? []).map((u: User) => {
    const userJobs = (apiJobs ?? []).filter(j => j.assignee?.id === u.id);
    return {
      name: u.name,
      role: u.role.charAt(0).toUpperCase() + u.role.slice(1),
      jobs: userJobs.length,
      completed: userJobs.filter(j => j.status === 'completed').length
    };
  }), [apiUsers, apiJobs]);

  const recentP = usePagination(recentJobs, 6);
  const teamP = usePagination(team, 5);
  
  return (
    <DashboardLayout title="Admin Overview" role="admin">
      {/* Banner */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative bg-gradient-to-br from-black via-gray-900 to-black rounded-2xl p-6 md:p-8 mb-6 overflow-hidden border border-gray-800"
      >
        <motion.div
          className="absolute -top-16 -right-10 w-72 h-72 rounded-full bg-primary/30 blur-3xl"
          animate={{ scale: [1, 1.1, 1], opacity: [0.4, 0.7, 0.4] }}
          transition={{ duration: 5, repeat: Infinity }}
        />
        <div className="relative z-10 flex items-start justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-white">Welcome back, {currentUser?.name?.split(" ")[0] ?? "Admin"} 👋</h2>
            <p className="text-sm text-gray-400 mt-1">Here's a snapshot of operations across your team.</p>
          </div>
          <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-3 py-1.5 text-xs text-gray-300">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> All systems operational
          </div>
        </div>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {stats.map((s, i) => {
          const Icon = s.icon;
          return (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.02 + i * 0.03 }}
              whileHover={{ y: -4, boxShadow: "0 14px 28px rgba(0,0,0,0.07)" }}
              className="relative bg-white rounded-2xl p-5 border border-gray-100 overflow-hidden"
            >
              <div className={`absolute top-0 right-0 w-32 h-32 rounded-full bg-gradient-to-br ${s.color} opacity-5 blur-2xl`} />
              <div className="relative z-10 flex items-start justify-between">
                <div className={`w-10 h-10 rounded-xl ${s.bg} ${s.text} flex items-center justify-center`}>
                  <Icon size={18} />
                </div>
                <div className={`flex items-center gap-0.5 text-xs font-bold px-2 py-0.5 rounded-full ${s.up ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                  {s.up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                  {s.change}%
                </div>
              </div>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.1 + i * 0.03 }}
                className="text-3xl font-bold text-gray-900 mt-4"
              >
                {showSkeleton ? (
                  <div className="h-8 w-16 bg-gray-100 rounded animate-pulse" />
                ) : (
                  s.value
                )}
              </motion.div>
              <div className="text-xs text-gray-500 font-medium mt-1">{s.label}</div>
            </motion.div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent jobs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 overflow-hidden"
        >
          <div className="p-5 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-gray-900">Recent Jobs</h3>
              <p className="text-xs text-gray-500 mt-0.5">Latest job activity across all teams</p>
            </div>
            <Link href="/admin/jobs" className="text-xs text-primary font-semibold hover:underline">View all</Link>
          </div>
          {recentP.pageItems.map((j, i) => (
            <motion.div
              key={j.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15 + i * 0.03 }}
              whileHover={{ backgroundColor: "rgb(249, 250, 251)", x: 4 }}
              className="flex items-center gap-4 px-5 py-4 border-b border-gray-50 last:border-0 cursor-pointer"
            >
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary/10 to-sky-100 text-primary flex items-center justify-center font-bold text-xs shrink-0">
                {j.id?.includes("-") ? j.id.split("-")[1]?.slice(-2) : (j.id?.slice(-2) ?? "??")}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm text-gray-900">{j.client}</div>
                <div className="text-xs text-gray-500 mt-0.5">{j.id ?? "No Number"} · Supervised by {j.supervisor}</div>
              </div>
              <span className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded-full ${j.color}`}>{j.status}</span>
            </motion.div>
          ))}
          <Pagination page={recentP.page} totalPages={recentP.totalPages} total={recentP.total} pageSize={recentP.pageSize} onChange={recentP.setPage} label="jobs" />
        </motion.div>

        {/* Team performance */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-2xl border border-gray-100 overflow-hidden"
        >
          <div className="p-5 border-b border-gray-100">
            <h3 className="font-bold text-gray-900 flex items-center gap-2"><TrendingUp size={16} className="text-primary" /> Team Performance</h3>
            <p className="text-xs text-gray-500 mt-0.5">Top performers this week</p>
          </div>
          <div className="p-5 space-y-4">
            {teamP.pageItems.map((t: any, i: number) => {
              const pct = t.jobs > 0 ? Math.round((t.completed / t.jobs) * 100) : 0;
              return (
                <motion.div
                  key={t.name}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.25 + i * 0.03 }}
                >
                  <div className="flex items-center gap-3 mb-1.5">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-sky-700 text-white text-xs font-bold flex items-center justify-center">
                      {t.name.split(" ").map((s: string) => s[0]).join("")}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-gray-900 truncate">{t.name}</div>
                      <div className="text-[10px] text-gray-500">{t.role}</div>
                    </div>
                    <div className="text-xs font-bold text-gray-900">{pct}%</div>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden ml-11">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ delay: 0.3 + i * 0.03, duration: 0.4, ease: "easeOut" }}
                      className="h-full rounded-full bg-primary"
                    />
                  </div>
                </motion.div>
              );
            })}
          </div>
          <Pagination page={teamP.page} totalPages={teamP.totalPages} total={teamP.total} pageSize={teamP.pageSize} onChange={teamP.setPage} label="members" />
        </motion.div>
      </div>

      {/* Quick actions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6"
      >
        {[
          { label: "Create Job", icon: Plus, color: "from-primary to-sky-700", href: "/admin/jobs" },
          { label: "Add User", icon: UserPlus, color: "from-emerald-500 to-emerald-700", href: "/admin/users" },
          { label: "Supervisors", icon: Users, color: "from-violet-500 to-violet-700", href: "/admin/supervisors" },
          { label: "Generate Report", icon: FileText, color: "from-amber-500 to-orange-600", href: "/admin/reports" },
        ].map((q) => {
          const Icon = q.icon;
          return (
            <Link key={q.label} href={q.href}>
              <motion.div
                whileHover={{ y: -3, scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="flex items-center gap-3 bg-white border border-gray-100 rounded-2xl p-4 hover:border-primary/30 hover:shadow-lg transition-all text-left group cursor-pointer"
              >
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${q.color} text-white flex items-center justify-center shadow-md`}>
                  <Icon size={18} />
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-sm text-gray-900">{q.label}</div>
                  <div className="text-[11px] text-gray-500">Click to start</div>
                </div>
                <ArrowUpRight size={16} className="text-gray-300 group-hover:text-primary group-hover:-translate-y-0.5 group-hover:translate-x-0.5 transition-all" />
              </motion.div>
            </Link>
          );
        })}
      </motion.div>
    </DashboardLayout>
  );
}
