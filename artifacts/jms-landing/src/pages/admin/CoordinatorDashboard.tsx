import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Link } from "wouter";
import {
  Briefcase, AlertCircle, Calendar, Clock, ArrowUpRight,
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import Pagination, { usePagination } from "@/components/Pagination";
import JobAddressLine from "@/components/JobAddressLine";
import { useAuth } from "@/lib/auth";
import type { Job } from "@workspace/api-client-react";

type CoordinatorDashboardResponse = {
  stats: {
    activeJobs?: number;
    totalJobs?: number;
    overdueJobs?: number;
    pendingReworkTasks?: number;
  };
  activeJobs?: Job[];
  overdue?: { id: string; title: string; address?: string | null; days: number; assignee: string }[];
};

const PRIORITY_COLOR: Record<string, string> = {
  High: "bg-red-50 text-red-700 border-red-200",
  Medium: "bg-amber-50 text-amber-700 border-amber-200",
  Low: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

async function fetchCoordinatorDashboard(): Promise<CoordinatorDashboardResponse> {
  const res = await fetch("/api/dashboard/coordinator", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load dashboard");
  return res.json();
}

export default function CoordinatorDashboard() {
  const { user: currentUser } = useAuth();
  const { data: dashboard, isLoading: statsLoading } = useQuery({
    queryKey: ["dashboard", "coordinator"],
    queryFn: fetchCoordinatorDashboard,
  });

  const showSkeleton = statsLoading && !dashboard;
  const stats = dashboard?.stats ?? {};

  const assignedJobs = useMemo(
    () =>
      (dashboard?.activeJobs ?? []).map((j) => ({
        id: j.id,
        number: j.number,
        title: j.title,
        client: j.client,
        address: j.address,
        due: j.dueDate ? new Date(j.dueDate).toLocaleDateString() : "No date",
        priority: j.priority.charAt(0).toUpperCase() + j.priority.slice(1),
        progress: j.progress,
      })),
    [dashboard?.activeJobs],
  );

  const overdue = useMemo(() => dashboard?.overdue ?? [], [dashboard?.overdue]);
  const assignedP = usePagination(assignedJobs, 5);
  const overdueP = usePagination(overdue, 4);

  return (
    <DashboardLayout title="Coordinator Dashboard" role="coordinator">
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
        <div className="relative z-10">
          <h2 className="text-2xl md:text-3xl font-bold text-white">
            Hey {currentUser?.name?.split(" ")[0] ?? "Coordinator"}, here are your jobs
          </h2>
          <p className="text-sm text-gray-400 mt-1">
            You have {stats.activeJobs ?? 0} active jobs assigned as coordinator. Approval stays with the supervisor.
          </p>
        </div>
      </motion.div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Active Jobs", value: stats.activeJobs ?? 0, icon: Briefcase, color: "from-primary to-sky-700", bg: "bg-primary/10", text: "text-primary" },
          { label: "Total Jobs", value: stats.totalJobs ?? 0, icon: Clock, color: "from-purple-500 to-purple-700", bg: "bg-purple-50", text: "text-purple-600" },
          { label: "Overdue Jobs", value: stats.overdueJobs ?? 0, icon: AlertCircle, color: "from-red-500 to-rose-700", bg: "bg-red-50", text: "text-red-600" },
          { label: "Pending Rework", value: stats.pendingReworkTasks ?? 0, icon: ArrowUpRight, color: "from-amber-500 to-orange-700", bg: "bg-amber-50", text: "text-amber-600" },
        ].map((s, i) => {
          const Icon = s.icon;
          return (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 + i * 0.06 }}
              className="relative bg-white rounded-2xl p-5 border border-gray-100 overflow-hidden"
            >
              <div className="relative z-10 flex items-center justify-between">
                <div>
                  <div className="text-xs text-gray-500 font-medium uppercase tracking-wider">{s.label}</div>
                  <div className="text-3xl font-bold text-gray-900 mt-1">
                    {showSkeleton ? <div className="h-8 w-16 bg-gray-100 rounded animate-pulse" /> : s.value}
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
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 overflow-hidden"
        >
          <div className="p-5 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-gray-900">Active Jobs</h3>
              <p className="text-xs text-gray-500 mt-0.5">Jobs where you are the coordinator</p>
            </div>
            <Link href="/coordinator/jobs"><span className="text-xs text-primary font-semibold hover:underline cursor-pointer">View all</span></Link>
          </div>
          {assignedP.pageItems.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-500">No active jobs assigned yet.</div>
          ) : (
            assignedP.pageItems.map((j, i) => (
              <Link key={j.id} href={`/coordinator/jobs/${j.id}`}>
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.35 + i * 0.05 }}
                  className="px-5 py-4 border-b border-gray-50 last:border-0 cursor-pointer hover:bg-gray-50"
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-sm text-gray-900">{j.title}</span>
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${PRIORITY_COLOR[j.priority]}`}>{j.priority}</span>
                      </div>
                      <div className="text-xs text-gray-500">{j.number} · {j.client}</div>
                      <JobAddressLine address={j.address} />
                    </div>
                    <div className="flex items-center gap-1 text-xs text-gray-500 shrink-0">
                      <Calendar size={12} /> {j.due}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${j.progress}%` }} />
                    </div>
                    <span className="text-xs font-bold text-gray-900 w-10 text-right">{j.progress}%</span>
                  </div>
                </motion.div>
              </Link>
            ))
          )}
          <Pagination page={assignedP.page} totalPages={assignedP.totalPages} total={assignedP.total} pageSize={assignedP.pageSize} onChange={assignedP.setPage} label="jobs" />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-white rounded-2xl border border-gray-100 overflow-hidden"
        >
          <div className="p-5 border-b border-gray-100">
            <h3 className="font-bold text-gray-900 flex items-center gap-2"><AlertCircle size={16} className="text-red-500" /> Overdue</h3>
          </div>
          {overdueP.pageItems.length === 0 ? (
            <div className="p-6 text-center text-sm text-gray-500">No overdue jobs.</div>
          ) : (
            overdueP.pageItems.map((j) => (
              <Link key={j.id} href={`/coordinator/jobs/${j.id}`}>
                <div className="px-5 py-4 border-b border-gray-50 last:border-0 hover:bg-gray-50 cursor-pointer">
                  <div className="font-medium text-sm text-gray-900">{j.title}</div>
                  <div className="text-xs text-red-600 mt-1">{j.days} day{j.days === 1 ? "" : "s"} overdue · {j.assignee}</div>
                </div>
              </Link>
            ))
          )}
          <Pagination page={overdueP.page} totalPages={overdueP.totalPages} total={overdueP.total} pageSize={overdueP.pageSize} onChange={overdueP.setPage} label="jobs" />
        </motion.div>
      </div>
    </DashboardLayout>
  );
}
