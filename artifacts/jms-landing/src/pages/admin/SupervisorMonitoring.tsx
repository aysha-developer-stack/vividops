import { useMemo, useState } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Activity, Briefcase, Clock, AlertCircle, CheckCircle2,
  TrendingUp, TrendingDown, Eye, X, Users, ClipboardCheck,
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import Pagination, { usePagination } from "@/components/Pagination";
import { useAuth } from "@/lib/auth";
import { useGetTimeLogs, useListJobs, useListUsers, type Job, type TimeLog, type User } from "@workspace/api-client-react";
import type { Role } from "@/lib/roles";
import { getPresenceStatus } from "@/lib/presence";
import { formatShortDate } from "@/lib/jobMappers";

interface AssignedWorker {
  id: string;
  name: string;
  assignedJobs: number;
  activeJobs: number;
  completedJobs: number;
  jobNumbers: string[];
}

interface CheckedJobRow {
  id: string;
  jobNumber: string;
  title: string;
  assigneeName: string;
  checkedAt: string;
  checkedAtMs: number;
  status: string;
}

interface SupervisorCard {
  id: string;
  name: string;
  avatar: string;
  teamSize: number;
  assignedJobs: number;
  activeJobs: number;
  completedJobs: number;
  checkedJobs: number;
  overdue: number;
  completionRate: number;
  hoursThisWeek: number;
  status: "online" | "away" | "offline";
  trend: number;
  lastSeen: string;
  lastCheckedAt: string | null;
  workers: AssignedWorker[];
  recentChecks: CheckedJobRow[];
}

const STATUS_DOT: Record<SupervisorCard["status"], string> = {
  online: "bg-emerald-400",
  away: "bg-amber-400",
  offline: "bg-gray-400",
};

function parseMs(iso: string | null | undefined) {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function formatLastSeen(ms: number | null, status: SupervisorCard["status"]) {
  if (status === "offline") return "Offline";
  if (!ms) return status === "away" ? "No recent activity" : "Just now";
  const diffMinutes = Math.max(0, Math.floor((Date.now() - ms) / 60000));
  if (diffMinutes < 2) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const hours = Math.floor(diffMinutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatCheckTime(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function jobNumberOf(job: Job) {
  const serial = (job as any).jobNumber ?? (job as any).serial;
  if (serial != null && String(serial).trim()) return `JOB-${serial}`;
  return `JOB-${job.id.slice(0, 6).toUpperCase()}`;
}

function isCheckedBySupervisor(job: Job, supervisorId: string, supervisorName: string) {
  const checkedById = (job as any).checkedById as string | null | undefined;
  if (checkedById && checkedById === supervisorId) return true;
  const label = ((job as any).checkedByLabel as string | null | undefined) ?? "";
  if (!label) return false;
  // Fallback for older rows: label is "Name · role"
  const namePart = label.split("·")[0]?.trim().toLowerCase() ?? "";
  return namePart === supervisorName.trim().toLowerCase() && /supervisor/i.test(label);
}

export default function SupervisorMonitoring({ role = "admin" as Role }: { role?: Role } = {}) {
  const { user: currentUser } = useAuth();
  const { data: apiUsers, isLoading: usersLoading } = useListUsers({
    query: { refetchInterval: 30_000 } as any,
  });
  const { data: apiJobs, isLoading: jobsLoading } = useListJobs();
  const { data: apiTimeLogs, isLoading: logsLoading } = useGetTimeLogs();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<SupervisorCard | null>(null);

  const jobBase =
    role === "super-admin" ? "/super-admin/jobs"
    : role === "admin" ? "/admin/jobs"
    : "/supervisor/jobs";

  const supervisors: SupervisorCard[] = useMemo(() => {
    const baseSupervisors = (apiUsers ?? []).filter((u: User) => u.role === "supervisor");
    const supervisorMap = new Map(baseSupervisors.map((u) => [u.id, u]));
    if (role === "supervisor" && currentUser?.role === "supervisor") {
      supervisorMap.clear();
      supervisorMap.set(currentUser.id, currentUser as User);
    }

    const now = Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const weekStartMs = now - sevenDaysMs;
    const prevWeekStartMs = now - 2 * sevenDaysMs;

    return Array.from(supervisorMap.values()).map((u) => {
      const supervisedJobs = (apiJobs ?? []).filter((job: Job) => job.supervisor?.id === u.id);

      const workerMap = new Map<string, AssignedWorker>();
      for (const job of supervisedJobs) {
        const assigneeId = job.assignee?.id;
        const assigneeName = job.assignee?.name ?? "Unassigned";
        if (!assigneeId) continue;
        const existing = workerMap.get(assigneeId) ?? {
          id: assigneeId,
          name: assigneeName,
          assignedJobs: 0,
          activeJobs: 0,
          completedJobs: 0,
          jobNumbers: [],
        };
        existing.assignedJobs += 1;
        existing.jobNumbers.push(jobNumberOf(job));
        if (job.status !== "completed" && job.status !== "cancelled") existing.activeJobs += 1;
        if (job.status === "completed") existing.completedJobs += 1;
        workerMap.set(assigneeId, existing);
      }
      const workers = Array.from(workerMap.values()).sort((a, b) => b.assignedJobs - a.assignedJobs);

      const checkedJobsList: CheckedJobRow[] = supervisedJobs
        .filter((job) => isCheckedBySupervisor(job, u.id, u.name) && (job as any).checkedAt)
        .map((job) => {
          const checkedAt = String((job as any).checkedAt);
          return {
            id: job.id,
            jobNumber: jobNumberOf(job),
            title: job.title,
            assigneeName: job.assignee?.name ?? "Unassigned",
            checkedAt,
            checkedAtMs: parseMs(checkedAt) ?? 0,
            status: job.status,
          };
        })
        .sort((a, b) => b.checkedAtMs - a.checkedAtMs);

      const weekLogs = (apiTimeLogs ?? []).filter((log: TimeLog) => {
        const createdMs = parseMs(log.createdAt);
        if (createdMs == null || createdMs < weekStartMs) return false;
        const onSupervisedJob = log.jobId ? supervisedJobs.some((job) => job.id === log.jobId) : false;
        return log.userId === u.id || onSupervisedJob;
      });
      const hoursThisWeek = weekLogs.reduce((sum, log) => sum + (log.duration / 3600), 0);

      const activeJobs = supervisedJobs.filter((job) => job.status !== "completed" && job.status !== "cancelled").length;
      const completedJobs = supervisedJobs.filter((job) => job.status === "completed").length;
      const overdue = supervisedJobs.filter((job) => job.isOverdue).length;
      const assignedJobs = supervisedJobs.length;
      const checkedJobs = checkedJobsList.length;
      const totalTrackedJobs = activeJobs + completedJobs;
      const completionRate = totalTrackedJobs > 0 ? Math.round((completedJobs / totalTrackedJobs) * 100) : 0;

      const currentWeekCompleted = supervisedJobs.filter((job) => {
        const completedMs = parseMs(job.completedAt);
        return completedMs != null && completedMs >= weekStartMs;
      }).length;
      const previousWeekCompleted = supervisedJobs.filter((job) => {
        const completedMs = parseMs(job.completedAt);
        return completedMs != null && completedMs >= prevWeekStartMs && completedMs < weekStartMs;
      }).length;
      const trend =
        previousWeekCompleted === 0
          ? currentWeekCompleted > 0 ? 100 : 0
          : Math.round(((currentWeekCompleted - previousWeekCompleted) / previousWeekCompleted) * 100);

      const latestJobActivityMs = supervisedJobs.reduce((max, job) => {
        const ms = parseMs(job.updatedAt) ?? parseMs(job.createdAt) ?? 0;
        return Math.max(max, ms);
      }, 0);
      const latestLogMs = weekLogs.reduce((max, log) => Math.max(max, parseMs(log.createdAt) ?? 0), 0);
      const presenceMs = parseMs(u.lastSeenAt) ?? parseMs(u.lastSignInAt);
      const lastActivityMs = presenceMs ?? (Math.max(latestJobActivityMs, latestLogMs) || null);
      const status = getPresenceStatus({
        accountStatus: u.status,
        lastSeenAt: u.lastSeenAt,
        lastSignInAt: u.lastSignInAt,
      });

      return {
        id: u.id,
        name: u.name,
        avatar: u.name.split(" ").map((s) => s[0]).join("").toUpperCase().slice(0, 2),
        teamSize: workers.length,
        assignedJobs,
        activeJobs,
        completedJobs,
        checkedJobs,
        overdue,
        completionRate,
        hoursThisWeek: Number(hoursThisWeek.toFixed(1)),
        status,
        trend,
        lastSeen: formatLastSeen(lastActivityMs, status),
        lastCheckedAt: checkedJobsList[0]?.checkedAt ?? null,
        workers,
        recentChecks: checkedJobsList.slice(0, 12),
      };
    });
  }, [apiJobs, apiTimeLogs, apiUsers, currentUser, role]);

  const filtered = supervisors.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()));
  const supervisorsP = usePagination(filtered, 6);

  const totalAssigned = supervisors.reduce((acc, s) => acc + s.assignedJobs, 0);
  const totalChecked = supervisors.reduce((acc, s) => acc + s.checkedJobs, 0);
  const totalActive = supervisors.reduce((acc, s) => acc + s.activeJobs, 0);
  const totalOverdue = supervisors.reduce((acc, s) => acc + s.overdue, 0);

  const pageTitle = role === "supervisor" ? "My Team Monitoring" : "Supervisor Monitoring";

  if ((usersLoading || jobsLoading || logsLoading) && !apiUsers && !apiJobs && !apiTimeLogs) {
    return (
      <DashboardLayout title={pageTitle} role={role}>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title={pageTitle} role={role}>
      <div className="mb-5">
        <h2 className="text-lg font-bold text-gray-900">
          {role === "supervisor" ? "Your supervision overview" : "Supervisor oversight"}
        </h2>
        <p className="text-sm text-gray-500 mt-0.5">
          {role === "supervisor"
            ? "Track jobs assigned to your workers, checks you completed, and check times."
            : "See each supervisor’s assigned jobs by worker, jobs they checked, and when checks happened."}
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          {
            label: role === "supervisor" ? "My status" : "Supervisors",
            value: role === "supervisor"
              ? (supervisors[0]?.status === "online" ? "Online" : supervisors[0]?.status ?? "—")
              : supervisors.length,
            icon: Activity,
            color: "from-emerald-500 to-emerald-700",
            bg: "bg-emerald-50",
            text: "text-emerald-600",
          },
          { label: "Assigned jobs", value: totalAssigned, icon: Briefcase, color: "from-primary to-sky-700", bg: "bg-primary/10", text: "text-primary" },
          { label: "Jobs checked", value: totalChecked, icon: ClipboardCheck, color: "from-violet-500 to-violet-700", bg: "bg-violet-50", text: "text-violet-600" },
          { label: "Active / Overdue", value: `${totalActive} / ${totalOverdue}`, icon: AlertCircle, color: "from-red-500 to-rose-700", bg: "bg-red-50", text: "text-red-600" },
        ].map((s, i) => {
          const Icon = s.icon;
          return (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              whileHover={{ y: -3, boxShadow: "0 12px 24px rgba(0,0,0,0.06)" }}
              className="relative bg-white rounded-2xl p-5 border border-gray-100 overflow-hidden"
            >
              <div className={`absolute top-0 right-0 w-32 h-32 rounded-full bg-gradient-to-br ${s.color} opacity-5 blur-2xl`} />
              <div className="relative z-10 flex items-center justify-between">
                <div>
                  <div className="text-xs text-gray-500 font-medium uppercase tracking-wider">{s.label}</div>
                  <div className="text-2xl font-bold text-gray-900 mt-1">{s.value}</div>
                </div>
                <div className={`w-11 h-11 rounded-xl ${s.bg} ${s.text} flex items-center justify-center`}>
                  <Icon size={20} />
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {(role === "admin" || role === "super-admin") && (
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-2.5 max-w-md mb-6 focus-within:border-primary transition-colors">
          <Search size={16} className="text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search supervisors…"
            className="bg-transparent !text-gray-900 !placeholder:text-gray-400 text-sm flex-1 focus:outline-none"
          />
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-sm text-gray-400">
          No supervisors found.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {supervisorsP.pageItems.map((sup, i) => (
              <motion.div
                key={sup.id}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
                whileHover={{ y: -5, boxShadow: "0 18px 36px rgba(0,0,0,0.07)" }}
                className="bg-white rounded-2xl border border-gray-100 p-5 cursor-pointer overflow-hidden group"
                onClick={() => setSelected(sup)}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative shrink-0">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-sky-700 text-white font-bold flex items-center justify-center">
                        {sup.avatar}
                      </div>
                      <span className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full ring-2 ring-white ${STATUS_DOT[sup.status]}`} />
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-gray-900 truncate">{sup.name}</div>
                      <div className="text-xs text-gray-500 flex items-center gap-1">
                        <Users size={11} /> {sup.teamSize} worker{sup.teamSize === 1 ? "" : "s"}
                      </div>
                      <div className="text-[10px] text-gray-400 mt-0.5">{sup.lastSeen}</div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="text-center p-2.5 rounded-xl bg-primary/5">
                    <div className="text-lg font-bold text-primary">{sup.assignedJobs}</div>
                    <div className="text-[10px] text-gray-500 uppercase tracking-wide">Assigned</div>
                  </div>
                  <div className="text-center p-2.5 rounded-xl bg-violet-50">
                    <div className="text-lg font-bold text-violet-600">{sup.checkedJobs}</div>
                    <div className="text-[10px] text-gray-500 uppercase tracking-wide">Checked</div>
                  </div>
                  <div className="text-center p-2.5 rounded-xl bg-emerald-50">
                    <div className="text-lg font-bold text-emerald-600">{sup.completedJobs}</div>
                    <div className="text-[10px] text-gray-500 uppercase tracking-wide">Done</div>
                  </div>
                  <div className="text-center p-2.5 rounded-xl bg-red-50">
                    <div className="text-lg font-bold text-red-600">{sup.overdue}</div>
                    <div className="text-[10px] text-gray-500 uppercase tracking-wide">Late</div>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs pt-1 border-t border-gray-50">
                  <div className="flex items-center gap-1 text-gray-600 min-w-0">
                    <Clock size={12} className="shrink-0" />
                    <span className="truncate">
                      {sup.lastCheckedAt ? `Last check ${formatCheckTime(sup.lastCheckedAt)}` : "No checks yet"}
                    </span>
                  </div>
                  <div className={`flex items-center gap-0.5 font-bold shrink-0 ${sup.trend > 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {sup.trend > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                    {Math.abs(sup.trend)}%
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
          {(role === "admin" || role === "super-admin") && (
            <div className="mt-4 bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <Pagination
                page={supervisorsP.page}
                totalPages={supervisorsP.totalPages}
                total={supervisorsP.total}
                pageSize={supervisorsP.pageSize}
                onChange={supervisorsP.setPage}
                label="supervisors"
              />
            </div>
          )}
        </>
      )}

      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelected(null)}
            className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-0 md:p-6"
          >
            <motion.div
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 50, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-t-3xl md:rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-start gap-4 mb-6">
                <div className="relative shrink-0">
                  <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary to-sky-700 text-white text-lg font-bold flex items-center justify-center">
                    {selected.avatar}
                  </div>
                  <span className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full ring-2 ring-white ${STATUS_DOT[selected.status]}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-xl text-gray-900">{selected.name}</div>
                  <div className="text-sm text-gray-500">
                    {selected.teamSize} workers · {selected.assignedJobs} assigned jobs · {selected.checkedJobs} checked
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    Last check: {selected.lastCheckedAt ? formatCheckTime(selected.lastCheckedAt) : "—"}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
                {[
                  { label: "Assigned", val: selected.assignedJobs },
                  { label: "Checked", val: selected.checkedJobs },
                  { label: "Active", val: selected.activeJobs },
                  { label: "Completion", val: `${selected.completionRate}%` },
                ].map((m) => (
                  <div key={m.label} className="rounded-xl bg-gray-50 border border-gray-100 p-3 text-center">
                    <div className="text-lg font-bold text-gray-900">{m.val}</div>
                    <div className="text-[10px] uppercase tracking-wide text-gray-500">{m.label}</div>
                  </div>
                ))}
              </div>

              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <Users size={14} className="text-primary" />
                  <h3 className="text-sm font-bold text-gray-900">Jobs assigned by worker</h3>
                </div>
                {selected.workers.length === 0 ? (
                  <div className="text-sm text-gray-400 rounded-xl border border-dashed border-gray-200 p-4 text-center">
                    No workers assigned under this supervisor yet.
                  </div>
                ) : (
                  <div className="rounded-xl border border-gray-100 overflow-hidden">
                    <div className="divide-y divide-gray-50 max-h-56 overflow-y-auto">
                      {selected.workers.map((w) => (
                        <div key={w.id} className="px-4 py-3 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-gray-900">{w.name}</div>
                            <div className="text-[11px] text-gray-500 mt-0.5 truncate">
                              {w.jobNumbers.slice(0, 4).join(", ")}
                              {w.jobNumbers.length > 4 ? ` +${w.jobNumbers.length - 4} more` : ""}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-sm font-bold text-primary">{w.assignedJobs}</div>
                            <div className="text-[10px] text-gray-500 uppercase">
                              {w.activeJobs} active · {w.completedJobs} done
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="mb-2">
                <div className="flex items-center gap-2 mb-3">
                  <ClipboardCheck size={14} className="text-violet-600" />
                  <h3 className="text-sm font-bold text-gray-900">Jobs checked · time of checking</h3>
                </div>
                {selected.recentChecks.length === 0 ? (
                  <div className="text-sm text-gray-400 rounded-xl border border-dashed border-gray-200 p-4 text-center">
                    This supervisor has not checked any jobs yet.
                  </div>
                ) : (
                  <div className="rounded-xl border border-gray-100 overflow-hidden">
                    <div className="divide-y divide-gray-50 max-h-64 overflow-y-auto">
                      {selected.recentChecks.map((job) => (
                        <Link
                          key={job.id}
                          href={`${jobBase}/${job.id}`}
                          className="px-4 py-3 flex items-start justify-between gap-3 hover:bg-gray-50 transition-colors block"
                        >
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-gray-900 truncate">
                              {job.jobNumber} · {job.title}
                            </div>
                            <div className="text-[11px] text-gray-500 mt-0.5">
                              Assignee: {job.assigneeName}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-xs font-semibold text-violet-700 flex items-center gap-1 justify-end">
                              <Clock size={11} />
                              {formatCheckTime(job.checkedAt)}
                            </div>
                            <div className="text-[10px] text-gray-400 mt-0.5">
                              {formatShortDate(job.checkedAt)}
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => setSelected(null)}
                className="mt-6 w-full py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 flex items-center justify-center gap-2"
              >
                <Eye size={14} /> Close detail
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </DashboardLayout>
  );
}
