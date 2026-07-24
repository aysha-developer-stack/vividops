import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, AlertCircle, Plus, X, Activity, FileWarning,
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import Pagination, { usePagination } from "@/components/Pagination";
import { useAuth } from "@/lib/auth";
import {
  useListUsers,
  useListJobs,
  useGetTimeLogs,
  type User,
  type Job,
  type TimeLog,
} from "@workspace/api-client-react";

import type { Role } from "@/lib/roles";
import {
  MISTAKE_CATEGORIES,
  formatMistakeCategory,
  type MistakeCategory,
} from "@/lib/mistakeCategories";
import { getPresenceStatus } from "@/lib/presence";

interface Worker {
  id: string;
  name: string;
  avatar: string;
  hoursToday: number;
  hoursWeek: number;
  jobsCompleted: number;
  errors: number;
  efficiency: number;
  status: "active" | "idle" | "offline";
  lastJob: string;
}

type ApiErrorReport = {
  id: string;
  jobId: string | null;
  userId: string;
  createdById: string;
  title: string;
  description: string;
  category?: string;
  checklistItemId?: number | null;
  source?: string;
  severity: "low" | "medium" | "high";
  status: "open" | "resolved";
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  jobNumber: string | null;
  jobTitle: string | null;
  user: { id: string; name: string; role: string } | null;
  createdBy: { id: string; name: string; role: string } | null;
};

type MistakeAnalytics = {
  byUser: Array<{ userId: string; name: string; count: number; openCount: number }>;
  byCategory: Array<{ category: string; count: number }>;
  total: number;
  open: number;
};

const SEVERITY: Record<"high" | "medium" | "low", string> = {
  high: "bg-red-50 text-red-700 border-red-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  low: "bg-blue-50 text-blue-700 border-blue-200",
};

function parseMs(iso: string | null | undefined) {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function getLatestJobNumber(jobs: Job[]) {
  const latest = [...jobs].sort((a, b) => {
    const aMs =
      parseMs(a.completedAt) ??
      parseMs(a.updatedAt) ??
      parseMs(a.createdAt) ??
      0;
    const bMs =
      parseMs(b.completedAt) ??
      parseMs(b.updatedAt) ??
      parseMs(b.createdAt) ??
      0;
    return bMs - aMs;
  })[0];

  return latest?.number ?? "None";
}

function getWorkerStatus(user: User): Worker["status"] {
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
    if (completedMs != null && dueMs != null && completedMs <= dueMs) {
      return acc + 1;
    }
    return acc;
  }, 0);
  const reworkCount = jobs.filter((job) => job.status === "rework").length;

  const completionRate = completedCount / jobs.length;
  const onTimeRate = completedCount > 0 ? onTimeCount / completedCount : 0;
  const reworkRate = reworkCount / jobs.length;

  const score =
    completionRate * 60 +
    onTimeRate * 25 +
    (1 - clamp(reworkRate, 0, 1)) * 15;

  return Math.round(clamp(score, 0, 100));
}

export default function UserMonitoring(
  { initialTab = "performance", role = "super-admin" }: { initialTab?: "performance" | "errors", role?: Role } = {}
) {
  const { user: currentUser } = useAuth();
  const { data: apiUsers, isLoading: usersLoading } = useListUsers({
    query: { refetchInterval: 30_000 } as any,
  });
  const { data: apiJobs, isLoading: jobsLoading } = useListJobs();
  const { data: apiTimeLogs, isLoading: logsLoading } = useGetTimeLogs();

  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"performance" | "errors">(initialTab);
  const [errorModal, setErrorModal] = useState(false);
  const [errors, setErrors] = useState<ApiErrorReport[]>([]);
  const [jobMemberships, setJobMemberships] = useState<Record<string, string[]>>({});
  const [selectedError, setSelectedError] = useState<ApiErrorReport | null>(null);
  const [updatingError, setUpdatingError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<{
    jobId: string;
    userId: string;
    title: string;
    severity: "low" | "medium" | "high";
    desc: string;
    category: MistakeCategory;
  }>({
    jobId: "",
    userId: "",
    title: "",
    severity: "medium",
    desc: "",
    category: "other",
  });
  const [analytics, setAnalytics] = useState<MistakeAnalytics | null>(null);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/error-reports", { credentials: "include" });
        if (!res.ok) return;
        const data = (await res.json()) as unknown;
        if (!Array.isArray(data)) return;
        if (!cancelled) setErrors(data as ApiErrorReport[]);
      } catch {
      }
    })();
    return () => { cancelled = true; };
  }, [tab]);

  useEffect(() => {
    if (tab !== "errors") return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/error-reports/analytics", { credentials: "include" });
        if (!res.ok) return;
        const data = (await res.json()) as MistakeAnalytics;
        if (!cancelled) setAnalytics(data);
      } catch {
      }
    })();
    return () => { cancelled = true; };
  }, [tab, errors]);

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
            const res = await fetch(`/api/jobs/${job.id}/members`, { credentials: "include" });
            if (!res.ok) return [job.id, []] as const;
            const data = (await res.json()) as Array<{ id: string; role: string }>;
            const userIds = Array.isArray(data)
              ? data
                  .filter((member) => member?.role === "user" && typeof member.id === "string")
                  .map((member) => member.id)
              : [];
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

  const jobBase =
    role === "super-admin" ? "/super-admin/jobs"
    : role === "admin" ? "/admin/jobs"
    : role === "supervisor" ? "/supervisor/jobs"
    : "/user/jobs";

  const updateErrorStatus = async (id: string, status: "open" | "resolved") => {
    try {
      setUpdatingError(true);
      const res = await fetch(`/api/error-reports/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) return;
      const updated = (await res.json()) as ApiErrorReport;
      setErrors((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
      setSelectedError((prev) => (prev?.id === updated.id ? updated : prev));
    } finally {
      setUpdatingError(false);
    }
  };

  const workers: Worker[] = useMemo(() => {
    const now = new Date();
    const startOfTodayMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const dayOffset = (now.getDay() + 6) % 7;
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOffset);
    const startOfWeekMs = startOfWeek.getTime();
    const scoreWindowMs = Date.now() - 30 * 24 * 60 * 60 * 1000;

    return (apiUsers ?? [])
      .filter((u: User) => u.role === "user")
      .map((u: User) => {
        const userJobs = (apiJobs ?? []).filter((job) =>
          job.assignee?.id === u.id || (jobMemberships[job.id] ?? []).includes(u.id),
        );
        const userLogs = (apiTimeLogs ?? []).filter((log) => log.userId === u.id);
        const userErrors = errors.filter((error) => error.userId === u.id && error.status !== "resolved");

        const hoursToday = userLogs
          .filter((log) => {
            const createdMs = parseMs(log.createdAt);
            return createdMs != null && createdMs >= startOfTodayMs;
          })
          .reduce((sum, log) => sum + (log.duration / 3600), 0);

        const hoursWeek = userLogs
          .filter((log) => {
            const createdMs = parseMs(log.createdAt);
            return createdMs != null && createdMs >= startOfWeekMs;
          })
          .reduce((sum, log) => sum + (log.duration / 3600), 0);

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

        return {
          id: u.id,
          name: u.name,
          avatar: u.name.split(" ").map((s) => s[0]).join("").toUpperCase().slice(0, 2),
          hoursToday: Number(hoursToday.toFixed(1)),
          hoursWeek: Number(hoursWeek.toFixed(1)),
          jobsCompleted: userJobs.filter((job) => job.status === "completed").length,
          errors: userErrors.length,
          efficiency: getPerformanceScore(scoreJobs),
          status: getWorkerStatus(u),
          lastJob: getLatestJobNumber(userJobs),
        };
      });
  }, [apiJobs, apiTimeLogs, apiUsers, errors, jobMemberships]);

  const filtered = workers.filter((w: Worker) => w.name.toLowerCase().includes(search.toLowerCase()));
  const workersP = usePagination(filtered, 6);
  const filteredErrors = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return errors;
    return errors.filter((e) => {
      const userName = e.user?.name ?? "";
      const job = `${e.jobNumber ?? ""} ${e.jobTitle ?? ""}`.trim();
      return (
        e.title.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        userName.toLowerCase().includes(q) ||
        job.toLowerCase().includes(q)
      );
    });
  }, [errors, search]);
  const errorsP = usePagination(filteredErrors, 6);

  const submitError = async () => {
    if (!draft.jobId || !draft.userId || !draft.title.trim() || !draft.desc.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/error-reports", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: draft.jobId,
          userId: draft.userId,
          title: draft.title.trim(),
          description: draft.desc.trim(),
          severity: draft.severity,
          category: draft.category,
          source: "manual",
        }),
      });
      if (!res.ok) return;
      const created = (await res.json()) as ApiErrorReport;
      setErrors((prev) => [created, ...prev]);
      setErrorModal(false);
      setTab("errors");
      setDraft({ jobId: "", userId: "", title: "", severity: "medium", desc: "", category: "other" });
    } finally {
      setSaving(false);
    }
  };

  const isLoading = usersLoading || jobsLoading || logsLoading;
  const anyData = apiUsers || apiJobs || apiTimeLogs;

  if (isLoading && !anyData) {
    return (
      <DashboardLayout title={initialTab === "errors" ? "Error Reports" : "User Monitoring"} role={role}>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title={tab === "errors" ? "Error Reports" : "User Monitoring"} role={role}>
      {/* Tab pills */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
          {[
            { id: "performance" as const, label: "Performance", icon: Activity },
            { id: "errors" as const, label: "Error Reports", icon: FileWarning },
          ].map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <motion.button
                key={t.id}
                whileTap={{ scale: 0.97 }}
                onClick={() => setTab(t.id)}
                className={`relative flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${active ? "text-white" : "text-gray-600 hover:text-gray-900"}`}
              >
                {active && <motion.div layoutId="userMonTab" className="absolute inset-0 bg-primary rounded-lg pointer-events-none" transition={{ type: "spring", stiffness: 300, damping: 25 }} />}
                <span className="relative flex items-center gap-2"><Icon size={14} /> {t.label}</span>
              </motion.button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          {(role === "admin" || role === "super-admin") && (
            <Link
              href={role === "super-admin" ? "/super-admin/supervisors" : "/admin/supervisors"}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold border border-gray-200 bg-white text-gray-700 hover:border-primary hover:text-primary transition-colors"
            >
              Supervisor oversight
            </Link>
          )}
          {tab === "errors" && (
            <motion.button
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => setErrorModal(true)}
              className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-xl text-xs font-semibold shadow-md shadow-primary/30"
            >
              <Plus size={14} /> New Error Report
            </motion.button>
          )}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {tab === "performance" ? (
          <motion.div
            key="perf"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
          >
            {/* Search */}
            <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-2.5 max-w-md mb-5 focus-within:border-primary transition-colors">
              <Search size={16} className="text-gray-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search team members…" className="bg-transparent text-gray-900 placeholder:text-gray-400 text-sm flex-1 focus:outline-none" />
            </div>

            {/* Workers grid */}
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
                      <div className="w-11 h-11 rounded-full bg-gradient-to-br from-primary to-sky-700 text-white text-sm font-bold flex items-center justify-center">{w.avatar}</div>
                      <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full ring-2 ring-white ${w.status === "active" ? "bg-emerald-400" : w.status === "idle" ? "bg-amber-400" : "bg-gray-400"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm text-gray-900 truncate">{w.name}</div>
                      <div className="text-[10px] text-gray-500">
                        {w.status === "active" ? "Online" : w.status === "idle" ? "Away" : "Offline"} · Last job: {w.lastJob}
                      </div>
                    </div>
                    <div className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${w.efficiency >= 90 ? "bg-emerald-50 text-emerald-700" : w.efficiency >= 80 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"}`}>
                      {w.efficiency}%
                    </div>
                  </div>

                  {/* Time tracking bar */}
                  <div className="mb-3">
                    <div className="flex justify-between text-[10px] text-gray-500 mb-1">
                      <span>Today</span>
                      <span className="font-bold">{w.hoursToday}h / 8h</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min((w.hoursToday / 8) * 100, 100)}%` }} transition={{ duration: 0.6 + i * 0.04 }} className="h-full bg-primary rounded-full" />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-3 border-t border-gray-100">
                    <div className="text-center">
                      <div className="text-base font-bold text-gray-900">{w.hoursWeek}h</div>
                      <div className="text-[9px] text-gray-500 uppercase tracking-wide">This week</div>
                    </div>
                    <div className="text-center">
                      <div className="text-base font-bold text-emerald-600">{w.jobsCompleted}</div>
                      <div className="text-[9px] text-gray-500 uppercase tracking-wide">Done</div>
                    </div>
                    <div className="text-center">
                      <div className={`text-base font-bold ${w.errors > 0 ? "text-red-600" : "text-gray-300"}`}>{w.errors}</div>
                      <div className="text-[9px] text-gray-500 uppercase tracking-wide">Errors</div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
            <div className="mt-4 bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <Pagination page={workersP.page} totalPages={workersP.totalPages} total={workersP.total} pageSize={workersP.pageSize} onChange={workersP.setPage} label="team members" />
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="err"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="bg-white rounded-2xl border border-gray-100 overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-900">Mistake Records</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {errors.filter((e) => e.createdBy?.id === currentUser?.id && Date.now() - new Date(e.createdAt).getTime() < 30 * 24 * 60 * 60 * 1000).length} reports filed by you in the last 30 days
              </p>
              {analytics && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                    <p className="text-[10px] uppercase font-bold text-gray-500">Total mistakes</p>
                    <p className="text-xl font-bold text-gray-900">{analytics.total}</p>
                    <p className="text-xs text-amber-700">{analytics.open} open</p>
                  </div>
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                    <p className="text-[10px] uppercase font-bold text-gray-500 mb-1">Top users</p>
                    <div className="space-y-1">
                      {(analytics.byUser ?? []).slice(0, 3).map((u) => (
                        <div key={u.userId} className="flex justify-between text-xs gap-2">
                          <span className="text-gray-700 truncate">{u.name}</span>
                          <span className="font-semibold text-red-600">{u.count}</span>
                        </div>
                      ))}
                      {(analytics.byUser?.length ?? 0) === 0 && <p className="text-xs text-gray-400">No records yet</p>}
                    </div>
                  </div>
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                    <p className="text-[10px] uppercase font-bold text-gray-500 mb-1">Top mistake types</p>
                    <div className="space-y-1">
                      {(analytics.byCategory ?? []).slice(0, 3).map((c) => (
                        <div key={c.category} className="flex justify-between text-xs gap-2">
                          <span className="text-gray-700 truncate">{formatMistakeCategory(c.category)}</span>
                          <span className="font-semibold text-gray-900">{c.count}</span>
                        </div>
                      ))}
                      {(analytics.byCategory?.length ?? 0) === 0 && <p className="text-xs text-gray-400">No records yet</p>}
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 max-w-md focus-within:border-primary transition-colors">
                <Search size={16} className="text-gray-400" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search errors…" className="bg-transparent text-gray-900 placeholder:text-gray-400 text-sm flex-1 focus:outline-none" />
              </div>
            </div>
            {errorsP.pageItems.map((e, i) => (
              <motion.div
                key={e.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                whileHover={{ backgroundColor: "rgb(249,250,251)" }}
                onClick={() => setSelectedError(e)}
                className="px-5 py-4 border-b border-gray-50 last:border-0 cursor-pointer"
              >
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-red-50 text-red-600 flex items-center justify-center shrink-0">
                    <AlertCircle size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-semibold text-sm text-gray-900">{e.user?.name ?? "—"}</span>
                      <span className="text-xs text-gray-400">·</span>
                      <span className="text-xs text-primary font-medium">{e.jobNumber ?? "—"}</span>
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${SEVERITY[e.severity]}`}>{e.severity}</span>
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border bg-violet-50 text-violet-700 border-violet-200">{formatMistakeCategory(e.category)}</span>
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${e.status === "resolved" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-gray-50 text-gray-700 border-gray-200"}`}>{e.status}</span>
                    </div>
                    <p className="text-sm font-semibold text-gray-900">{e.title}</p>
                    <p className="text-sm text-gray-600 mt-0.5">{e.description}</p>
                    <div className="text-[10px] text-gray-400 mt-1">{new Date(e.createdAt).toLocaleString()}</div>
                  </div>
                </div>
              </motion.div>
            ))}
            <Pagination page={errorsP.page} totalPages={errorsP.totalPages} total={errorsP.total} pageSize={errorsP.pageSize} onChange={errorsP.setPage} label="reports" />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedError && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedError(null)}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              transition={{ type: "spring", stiffness: 300, damping: 28 }}
              onClick={(ev) => ev.stopPropagation()}
              className="bg-white rounded-2xl w-full max-w-2xl overflow-hidden border border-gray-100 shadow-2xl"
            >
              <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-lg font-bold text-gray-900 truncate">{selectedError.title}</h3>
                    <span className={`px-2 py-1 rounded-lg border text-[10px] font-semibold uppercase ${selectedError.status === "resolved" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-gray-50 text-gray-700 border-gray-200"}`}>{selectedError.status}</span>
                    <span className={`px-2.5 py-1 rounded-lg border text-[10px] font-semibold uppercase ${SEVERITY[selectedError.severity]}`}>{selectedError.severity}</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {selectedError.jobNumber ?? "—"} · {selectedError.jobTitle ?? "—"}
                  </div>
                </div>
                <button onClick={() => setSelectedError(null)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700">
                  <X size={16} />
                </button>
              </div>

              <div className="px-6 py-5 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="rounded-xl border border-gray-100 p-4">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Worker</div>
                    <div className="text-sm font-semibold text-gray-900 mt-1">{selectedError.user?.name ?? "—"}</div>
                  </div>
                  <div className="rounded-xl border border-gray-100 p-4">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Created By</div>
                    <div className="text-sm font-semibold text-gray-900 mt-1">{selectedError.createdBy?.name ?? "—"}</div>
                  </div>
                  <div className="rounded-xl border border-gray-100 p-4">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Created At</div>
                    <div className="text-sm font-semibold text-gray-900 mt-1">{new Date(selectedError.createdAt).toLocaleString()}</div>
                  </div>
                  <div className="rounded-xl border border-gray-100 p-4">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Report ID</div>
                    <div className="text-sm font-mono text-gray-700 mt-1 truncate">{selectedError.id}</div>
                  </div>
                </div>

                <div className="rounded-xl border border-gray-100 p-4">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Description</div>
                  <div className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">{selectedError.description}</div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
                  <div className="flex gap-2">
                    <button
                      onClick={() => { if (selectedError.jobId) window.location.assign(`${jobBase}/${selectedError.jobId}`); }}
                      disabled={!selectedError.jobId}
                      className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Open Job
                    </button>
                  </div>

                  {role !== "user" && (
                    <button
                      onClick={() => updateErrorStatus(selectedError.id, selectedError.status === "resolved" ? "open" : "resolved")}
                      disabled={updatingError}
                      className={`px-4 py-2 rounded-xl text-sm font-semibold text-white ${selectedError.status === "resolved" ? "bg-gray-700 hover:bg-gray-800" : "bg-emerald-600 hover:bg-emerald-700"} disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      {selectedError.status === "resolved" ? "Reopen" : "Mark Resolved"}
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* New error modal */}
      <AnimatePresence>
        {errorModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setErrorModal(false)}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl p-6 max-w-md w-full"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-900">New Error Report</h3>
                <button onClick={() => setErrorModal(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-gray-700 mb-1.5 block">Job</label>
                  <select
                    value={draft.jobId}
                    onChange={(e) => {
                      const jobId = e.target.value;
                      const job = (apiJobs ?? []).find((j) => j.id === jobId);
                      const userId = job?.assignee?.id ?? "";
                      setDraft({ ...draft, jobId, userId });
                    }}
                    className="w-full bg-white !text-gray-900 border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
                  >
                    <option value="">Select a job</option>
                    {(apiJobs ?? []).map((j) => (
                      <option key={j.id} value={j.id}>{j.number} · {j.title}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-700 mb-1.5 block">Worker</label>
                  <select
                    value={draft.userId}
                    onChange={(e) => setDraft({ ...draft, userId: e.target.value })}
                    className="w-full bg-white !text-gray-900 border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
                  >
                    <option value="">Select a worker</option>
                    {workers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-700 mb-1.5 block">Title</label>
                  <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className="w-full bg-white !text-gray-900 !placeholder:text-gray-400 border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary" placeholder="Missing dimensions" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-700 mb-1.5 block">Mistake type</label>
                  <select
                    value={draft.category}
                    onChange={(e) => setDraft({ ...draft, category: e.target.value as MistakeCategory })}
                    className="w-full bg-white !text-gray-900 border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
                  >
                    {MISTAKE_CATEGORIES.map((c) => (
                      <option key={c} value={c}>{formatMistakeCategory(c)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-700 mb-1.5 block">Severity</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(["low", "medium", "high"] as const).map((s) => (
                      <button key={s} onClick={() => setDraft({ ...draft, severity: s })} className={`py-2 rounded-lg text-xs font-bold border-2 ${SEVERITY[s]} ${draft.severity === s ? "ring-2 ring-primary ring-offset-1" : "opacity-60"}`}>{s}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-700 mb-1.5 block">Description</label>
                  <textarea value={draft.desc} onChange={(e) => setDraft({ ...draft, desc: e.target.value })} rows={3} className="w-full bg-white !text-gray-900 !placeholder:text-gray-400 border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary resize-none" placeholder="Describe the error…" />
                </div>
                <button
                  onClick={submitError}
                  disabled={!draft.jobId || !draft.userId || !draft.title.trim() || !draft.desc.trim() || saving}
                  className="w-full mt-2 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Submit Report
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </DashboardLayout>
  );
}
