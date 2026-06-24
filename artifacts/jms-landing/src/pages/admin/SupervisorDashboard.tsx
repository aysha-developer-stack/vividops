import { useMemo } from "react";
import { motion } from "framer-motion";
import { Link } from "wouter";
import {
  Briefcase, Users, AlertCircle, CheckCircle2, ArrowUpRight,
  Calendar, Clock, TrendingUp, Plus,
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import Pagination, { usePagination } from "@/components/Pagination";
import { useGetDashboardSupervisor } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";

const PRIORITY_COLOR: Record<string, string> = {
  High: "bg-red-50 text-red-700 border-red-200",
  Medium: "bg-amber-50 text-amber-700 border-amber-200",
  Low: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

export default function SupervisorDashboard() {
  const { user: currentUser } = useAuth();
  const { data: dashboard, isLoading: statsLoading } = useGetDashboardSupervisor();
  
  const showSkeleton = statsLoading && !dashboard;
  const stats = (dashboard?.stats ?? {}) as {
    activeJobs?: number;
    teamSize?: number;
    totalJobs?: number;
    overdueJobs?: number;
    pendingReworkTasks?: number;
    activeTimers?: number;
  };

  const assignedJobs = useMemo(() => (dashboard?.activeJobs ?? []).map(j => ({
    id: j.id,
    number: j.number,
    title: j.title,
    client: j.client,
    due: j.dueDate ? new Date(j.dueDate).toLocaleDateString() : "No date",
    priority: j.priority.charAt(0).toUpperCase() + j.priority.slice(1),
    progress: j.progress
  })), [dashboard?.activeJobs]);

  const team = useMemo(() => dashboard?.team ?? [], [dashboard?.team]);
  const overdue = useMemo(() => dashboard?.overdue ?? [], [dashboard?.overdue]);
  const avgProductivity = useMemo(() => {
    if (team.length === 0) return 0;
    return Math.round(team.reduce((sum: number, member: any) => sum + (member.efficiency ?? 0), 0) / team.length);
  }, [team]);

  const assignedP = usePagination(assignedJobs, 5);
  const teamP = usePagination(team, 5);
  const overdueP = usePagination(overdue, 4);

  return (
    <DashboardLayout title="Supervisor Dashboard" role="supervisor">
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
            <h2 className="text-2xl md:text-3xl font-bold text-white">Hey {currentUser?.name?.split(" ")[0] ?? "Supervisor"}, ready to lead today? 💪</h2>
            <p className="text-sm text-gray-400 mt-1">You have {stats.activeJobs ?? 0} active jobs and a team of {stats.teamSize ?? 0} reporting to you.</p>
          </div>
          <Link href="/supervisor/jobs">
            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white px-4 py-2.5 rounded-xl text-sm font-semibold shadow-lg shadow-primary/30">
              <Plus size={16} /> Create Job
            </motion.button>
          </Link>
        </div>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-2 xl:grid-cols-6 gap-4 mb-6">
        {[
          { label: "Active Jobs", value: stats.activeJobs ?? 0, icon: Briefcase, color: "from-primary to-sky-700", bg: "bg-primary/10", text: "text-primary" },
          { label: "Team Members", value: stats.teamSize ?? 0, icon: Users, color: "from-emerald-500 to-emerald-700", bg: "bg-emerald-50", text: "text-emerald-600" },
          { label: "Total Jobs", value: stats.totalJobs ?? 0, icon: CheckCircle2, color: "from-purple-500 to-purple-700", bg: "bg-purple-50", text: "text-purple-600" },
          { label: "Overdue Jobs", value: stats.overdueJobs ?? 0, icon: AlertCircle, color: "from-red-500 to-rose-700", bg: "bg-red-50", text: "text-red-600" },
          { label: "Pending Rework", value: stats.pendingReworkTasks ?? 0, icon: ArrowUpRight, color: "from-amber-500 to-orange-700", bg: "bg-amber-50", text: "text-amber-600" },
          { label: "Active Timers", value: stats.activeTimers ?? 0, icon: Clock, color: "from-cyan-500 to-blue-700", bg: "bg-cyan-50", text: "text-cyan-600" },
        ].map((s, i) => {
          const Icon = s.icon;
          return (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 + i * 0.06 }}
              whileHover={{ y: -4, boxShadow: "0 14px 28px rgba(0,0,0,0.07)" }}
              className="relative bg-white rounded-2xl p-5 border border-gray-100 overflow-hidden"
            >
              <div className={`absolute top-0 right-0 w-32 h-32 rounded-full bg-gradient-to-br ${s.color} opacity-5 blur-2xl`} />
              <div className="relative z-10 flex items-center justify-between">
                <div>
                  <div className="text-xs text-gray-500 font-medium uppercase tracking-wider">{s.label}</div>
                  <div className="text-3xl font-bold text-gray-900 mt-1">
                    {showSkeleton ? (
                      <div className="h-8 w-16 bg-gray-100 rounded animate-pulse" />
                    ) : (
                      s.value
                    )}
                  </div>
                </div>
                <div className={`w-11 h-11 rounded-xl ${s.bg} ${s.text} flex items-center justify-center`}>
                  <Icon size={20} />
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Assigned jobs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 overflow-hidden"
        >
          <div className="p-5 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-gray-900">My Active Jobs</h3>
              <p className="text-xs text-gray-500 mt-0.5">Jobs assigned to your team</p>
            </div>
            <Link href="/supervisor/jobs"><span className="text-xs text-primary font-semibold hover:underline cursor-pointer">View all</span></Link>
          </div>
          {assignedP.pageItems.map((j, i) => (
            <Link key={j.id} href={`/supervisor/jobs/${j.id}`}>
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.35 + i * 0.05 }}
                whileHover={{ backgroundColor: "rgb(249, 250, 251)", x: 4 }}
                className="px-5 py-4 border-b border-gray-50 last:border-0 cursor-pointer block"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-sm text-gray-900">{j.title}</span>
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${PRIORITY_COLOR[j.priority]}`}>{j.priority}</span>
                    </div>
                    <div className="text-xs text-gray-500">{j.number} · {j.client}</div>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-gray-500 shrink-0">
                    <Calendar size={12} /> {j.due}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <motion.div initial={{ width: 0 }} animate={{ width: `${j.progress}%` }} transition={{ duration: 0.7, delay: 0.5 + i * 0.04 }} className="h-full bg-primary rounded-full" />
                  </div>
                  <span className="text-xs font-bold text-gray-900 w-10 text-right">{j.progress}%</span>
                </div>
              </motion.div>
            </Link>
          ))}
          <Pagination page={assignedP.page} totalPages={assignedP.totalPages} total={assignedP.total} pageSize={assignedP.pageSize} onChange={assignedP.setPage} label="jobs" />
        </motion.div>

        {/* Team & overdue */}
        <div className="space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-white rounded-2xl border border-gray-100 overflow-hidden"
          >
            <div className="p-5 border-b border-gray-100">
              <h3 className="font-bold text-gray-900 flex items-center gap-2"><TrendingUp size={16} className="text-primary" /> My Team Today</h3>
              <p className="text-xs text-gray-500 mt-1">Average productivity: {avgProductivity}% across supervised workers.</p>
            </div>
            <div className="p-3">
              {teamP.pageItems.map((t: any, i: number) => (
                <motion.div
                  key={t.name}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5 + i * 0.05 }}
                  whileHover={{ x: 3 }}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer"
                >
                  <div className="relative">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-sky-700 text-white text-xs font-bold flex items-center justify-center">{t.avatar}</div>
                    <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full ring-2 ring-white ${t.status === "online" ? "bg-emerald-400" : "bg-amber-400"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <Link href={`/supervisor/monitoring?id=${t.id}`}>
                      <div className="text-sm font-semibold text-gray-900 truncate hover:text-primary transition-colors cursor-pointer">{t.name}</div>
                    </Link>
                    <div className="flex items-center gap-2 mt-0.5">
                      <div className="text-[10px] text-gray-500">{t.jobsToday} jobs · {t.hoursToday}h today</div>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${t.efficiency >= 90 ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}`}>
                        {t.efficiency}% Eff.
                      </span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
            <Pagination page={teamP.page} totalPages={teamP.totalPages} total={teamP.total} pageSize={teamP.pageSize} onChange={teamP.setPage} label="members" />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="bg-gradient-to-br from-red-50 to-rose-50 border border-red-100 rounded-2xl"
          >
            <div className="p-5 border-b border-red-100">
              <h3 className="font-bold text-red-900 flex items-center gap-2"><AlertCircle size={16} /> Overdue Jobs</h3>
            </div>
            <div className="p-3">
              {overdueP.pageItems.map((j: any, i: number) => (
                <motion.div
                  key={j.id}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.6 + i * 0.05 }}
                  className="p-3 rounded-xl border border-red-100 bg-red-50/30 mb-2 last:mb-0"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-gray-900 truncate">{j.title}</div>
                      <div className="text-[11px] text-gray-500 mt-0.5">{j.id} · {j.assignee}</div>
                    </div>
                    <div className="text-[10px] font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded-full whitespace-nowrap">
                      {j.days}d overdue
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
            <Pagination page={overdueP.page} totalPages={overdueP.totalPages} total={overdueP.total} pageSize={overdueP.pageSize} onChange={overdueP.setPage} label="jobs" />
          </motion.div>
        </div>
      </div>
    </DashboardLayout>
  );
}
