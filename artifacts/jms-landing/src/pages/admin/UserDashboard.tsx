import { useState, useEffect, useMemo, useRef } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import {
  Briefcase, Clock, Bell, GraduationCap, Play, ArrowRight,
  CheckCircle2, Calendar, ListChecks,
  AlertTriangle, TrendingUp, Square,
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import Pagination, { usePagination } from "@/components/Pagination";
import {
  useGetDashboardStats,
  useGetNotifications,
  useGetPosts,
  useListJobs,
  useGetTimeLogs,
  getGetTimeLogsQueryKey,
  getGetNotificationsQueryKey,
  useMarkNotificationRead,
  type Job,
  type Notification as ApiNotification,
  type Post
} from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function UserDashboard() {
  const { user: currentUser } = useAuth();
  const qc = useQueryClient();
  const { isLoading: statsLoading } = useGetDashboardStats();
  const { data: apiNotifs, isLoading: notifsLoading } = useGetNotifications({
    query: {
      staleTime: 0,
      refetchInterval: 30000,
    },
  });
  const markReadMutation = useMarkNotificationRead();
  const notificationsQueryKey = [...getGetNotificationsQueryKey(), currentUser?.id ?? "anonymous"];
  const { data: apiPosts, isLoading: postsLoading } = useGetPosts();
  const { data: apiJobs, isLoading: jobsLoading } = useListJobs();
  const { data: apiTimeLogs, isLoading: logsLoading } = useGetTimeLogs();

  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [taskDialogJobId, setTaskDialogJobId] = useState<string | null>(null);
  const [taskDialogValue, setTaskDialogValue] = useState("");
  const [taskDialogError, setTaskDialogError] = useState<string | null>(null);
  const taskDialogResolverRef = useRef<((task: string | null) => void) | null>(
    null,
  );
  const [errorReports, setErrorReports] = useState<Array<{
    id: string;
    title: string;
    description: string;
    severity: "low" | "medium" | "high";
    status: "open" | "resolved";
    createdAt: string;
    jobNumber: string | null;
    jobTitle: string | null;
  }>>([]);

  const readJobTimerState = (jobId: string) => {
    try {
      const raw = localStorage.getItem(`job_timer_v1:${jobId}`);
      if (!raw) return null;
      const data = JSON.parse(raw) as any;
      if (!data || data.v !== 1) return null;
      return {
        running: !!data.running,
        startedAt: typeof data.startedAt === "number" ? data.startedAt : null,
        accumulated: typeof data.accumulated === "number" ? data.accumulated : 0,
        task: typeof data.task === "string" ? data.task : "",
      };
    } catch {
      return null;
    }
  };

  const writeJobTimerState = (jobId: string, state: { running: boolean; startedAt: number | null; accumulated: number; task?: string }) => {
    try {
      localStorage.setItem(`job_timer_v1:${jobId}`, JSON.stringify({ v: 1, ...state }));
    } catch {
    }
  };

  const readGlobalTimerState = () => {
    try {
      const raw = localStorage.getItem("global_timer_v1");
      if (!raw) return null;
      const data = JSON.parse(raw) as any;
      if (!data || data.v !== 1) return null;
      return {
        running: !!data.running,
        startedAt: typeof data.startedAt === "number" ? data.startedAt : null,
        accumulated: typeof data.accumulated === "number" ? data.accumulated : 0,
        task: typeof data.task === "string" ? data.task : "",
        jobId: typeof data.jobId === "string" ? data.jobId : "",
      };
    } catch {
      return null;
    }
  };

  const writeGlobalTimerState = (state: { running: boolean; startedAt: number | null; accumulated: number; task: string; jobId: string }) => {
    try {
      localStorage.setItem("global_timer_v1", JSON.stringify({ v: 1, ...state }));
    } catch {
    }
  };

  const computeElapsed = (state: { running: boolean; startedAt: number | null; accumulated: number } | null) => {
    if (!state) return 0;
    const base = Math.max(0, Math.floor(state.accumulated));
    if (!state.running || !state.startedAt) return base;
    const extra = Math.max(0, Math.floor((Date.now() - state.startedAt) / 1000));
    return base + extra;
  };

  // Derive Statistics
  const stats = useMemo(() => {
    const myJobs = (apiJobs ?? []).filter(j => j.assignee?.id === currentUser?.id);
    const activeJobs = myJobs.filter(j => j.status !== 'completed').length;
    const completedJobs = myJobs.filter(j => j.status === 'completed').length;
    
    // Weekly hours
    const now = new Date();
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
    const weeklyLogs = (apiTimeLogs ?? []).filter(l => 
      l.userId === currentUser?.id && new Date(l.createdAt) >= startOfWeek
    );
    const weeklySeconds = weeklyLogs.reduce((acc, l) => acc + l.duration, 0);
    const weeklyHours = (weeklySeconds / 3600).toFixed(1);

    return {
      activeJobs,
      completedJobs,
      weeklyHours: `${weeklyHours}h`,
      pendingChecklists: myJobs.filter(j => j.progress < 100).length, // Proxy for checklists
      reworkTasks: myJobs.filter(j => (j.status as string) === 'rework').length
    };
  }, [apiJobs, apiTimeLogs, currentUser]);

  const assignedJobs = useMemo(() => (apiJobs ?? [])
    .filter(j => j.assignee?.id === currentUser?.id && j.status !== 'completed')
    .map((j: Job) => ({
      id: j.id,
      number: j.number,
      title: j.title,
      client: j.client,
      address: j.address ?? "No address",
      due: j.dueDate ? new Date(j.dueDate).toLocaleDateString() : "No date",
      status: j.status.charAt(0).toUpperCase() + j.status.slice(1),
      priority: j.priority.charAt(0).toUpperCase() + j.priority.slice(1)
    })), [apiJobs, currentUser]);

  const activeJob = useMemo(() => 
    assignedJobs.find(j => j.id === activeJobId) || assignedJobs[0]
  , [assignedJobs, activeJobId]);

  const activeTimer = useMemo(() => {
    for (const j of assignedJobs) {
      const s = readJobTimerState(j.id);
      if (s?.running) {
        return { kind: "job" as const, jobId: j.id, elapsed: computeElapsed(s), running: true, task: s.task };
      }
    }

    const g = readGlobalTimerState();
    if (g?.running) {
      const jid = g.jobId || null;
      return { kind: "global" as const, jobId: jid, task: g.task, elapsed: computeElapsed(g), running: true };
    }

    if (activeJobId) {
      const s = readJobTimerState(activeJobId);
      if (s) return { kind: "job" as const, jobId: activeJobId, elapsed: computeElapsed(s), running: s.running, task: s.task };
    }

    if (g) {
      const jid = g.jobId || null;
      return { kind: "global" as const, jobId: jid, task: g.task, elapsed: computeElapsed(g), running: g.running };
    }

    return null;
  }, [assignedJobs, activeJobId, tick]);

  const activeTimerLabel = useMemo(() => {
    if (!activeTimer) return activeJob?.title ?? "Select a job to start";
    if (activeTimer.kind === "job") {
      if (activeTimer.task?.trim()) return activeTimer.task.trim();
      const j = assignedJobs.find((x) => x.id === activeTimer.jobId);
      return j?.title ?? "Job";
    }
    if (activeTimer.jobId) {
      const j = assignedJobs.find((x) => x.id === activeTimer.jobId);
      if (j) return j.title;
    }
    return activeTimer.task?.trim() ? activeTimer.task.trim() : "General";
  }, [activeTimer, assignedJobs, activeJob?.title]);

  const notifs = useMemo(() => {
    const seenTitles = new Set<string>();
    const sorted = [...(apiNotifs ?? [])].sort((a, b) => {
      const unreadDiff = Number(!a.isRead) - Number(!b.isRead);
      if (unreadDiff !== 0) return -unreadDiff;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    const unique: ApiNotification[] = [];
    for (const n of sorted) {
      const key = `${n.type}:${n.title}`;
      if (seenTitles.has(key)) continue;
      seenTitles.add(key);
      unique.push(n);
      if (unique.length >= 5) break;
    }

    return unique.map((n) => ({
      id: n.id,
      title: n.title,
      desc: n.description,
      time: new Date(n.createdAt).toLocaleTimeString(),
      type: n.type,
      unread: !n.isRead,
    }));
  }, [apiNotifs]);

  const markNotifRead = async (id: string) => {
    qc.setQueryData(notificationsQueryKey, (prev: ApiNotification[] | undefined) => {
      if (!prev) return prev;
      return prev.map((n) => (n.id === id ? { ...n, isRead: true } : n));
    });
    try {
      await markReadMutation.mutateAsync({ id });
    } catch {
      await qc.invalidateQueries({ queryKey: notificationsQueryKey });
    }
  };

  const training = useMemo(() => (apiPosts ?? []).slice(0, 2).map((p: Post) => ({
    id: p.id,
    title: p.title,
    desc: p.body,
    category: p.category
  })), [apiPosts]);

  useEffect(() => {
    if (!currentUser?.id) {
      setErrorReports([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/error-reports", { credentials: "include" });
        if (!res.ok) return;
        const data = (await res.json()) as unknown;
        if (!Array.isArray(data)) return;
        if (!cancelled) setErrorReports(data as any[]);
      } catch {
      }
    })();
    return () => { cancelled = true; };
  }, [currentUser?.id]);

  const workSummary = useMemo(() => {
    const myJobs = (apiJobs ?? []).filter(j => j.assignee?.id === currentUser?.id);
    const myLogs = (apiTimeLogs ?? []).filter(l => l.userId === currentUser?.id);
    const totalSeconds = myLogs.reduce((acc, l) => acc + l.duration, 0);
    
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthCompleted = myJobs.filter(j => 
      j.status === 'completed' && j.completedAt && new Date(j.completedAt) >= startOfMonth
    ).length;

    return {
      totalJobs: myJobs.length,
      totalHours: Math.round(totalSeconds / 3600),
      monthCompleted
    };
  }, [apiJobs, apiTimeLogs, currentUser]);

  const assignedP = usePagination(assignedJobs, 3);

  useEffect(() => {
    const t = window.setInterval(() => setTick((v) => v + 1), 1000);
    return () => window.clearInterval(t);
  }, []);

  const fmt = (s: number) => `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  const stopAllRunningTimersAndSave = async (nextJobId: string) => {
    const runningJobTimers: Array<{ jobId: string; elapsed: number }> = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith("job_timer_v1:")) continue;
      const jid = key.slice("job_timer_v1:".length);
      if (!jid || jid === nextJobId) continue;
      const state = readJobTimerState(jid);
      if (!state?.running) continue;
      const elapsed = computeElapsed(state);
      if (elapsed > 0) runningJobTimers.push({ jobId: jid, elapsed });
    }

    const g = readGlobalTimerState();
    if (g?.running) {
      const elapsed = computeElapsed(g);
      if (elapsed > 0) {
        const jid = g.jobId?.trim() ? g.jobId : null;
        const jobTitle = jid ? assignedJobs.find((j) => j.id === jid)?.title ?? `Job ${jid.slice(0, 8)}…` : null;
        const task = g.task?.trim() ? g.task.trim() : jobTitle ? `Work (${jobTitle})` : null;
        try {
          if (task) {
            await fetch("/api/time-logs", {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ task, duration: elapsed, jobId: jid || null }),
            });
          }
        } catch {
        }
      }
      writeGlobalTimerState({ running: false, startedAt: null, accumulated: 0, task: "", jobId: "" });
    }

    for (const jt of runningJobTimers) {
      const storedTask = readJobTimerState(jt.jobId)?.task?.trim() ?? "";
      const jobTitle = assignedJobs.find((j) => j.id === jt.jobId)?.title ?? `Job ${jt.jobId.slice(0, 8)}…`;
      const task = storedTask || `Work (${jobTitle})`;
      try {
        await fetch("/api/time-logs", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ task, duration: jt.elapsed, jobId: jt.jobId }),
        });
      } catch {
      }
      writeJobTimerState(jt.jobId, { running: false, startedAt: null, accumulated: 0, task: "" });
    }

    await qc.invalidateQueries({ queryKey: getGetTimeLogsQueryKey() });
  };

  const requestTaskForJob = (jobId: string) => {
    setTaskDialogJobId(jobId);
    setTaskDialogValue("");
    setTaskDialogError(null);
    setTaskDialogOpen(true);
    return new Promise<string | null>((resolve) => {
      taskDialogResolverRef.current = resolve;
    });
  };

  const resolveTaskDialog = (value: string | null) => {
    const r = taskDialogResolverRef.current;
    taskDialogResolverRef.current = null;
    setTaskDialogOpen(false);
    setTaskDialogJobId(null);
    setTaskDialogValue("");
    setTaskDialogError(null);
    r?.(value);
  };

  const startFromDashboard = async (jobId: string) => {
    const prev = readJobTimerState(jobId);
    const existingTask = prev?.task?.trim() ?? "";
    const nextTask = existingTask || (await requestTaskForJob(jobId))?.trim() || "";
    if (!nextTask) return;
    await stopAllRunningTimersAndSave(jobId);
    setActiveJobId(jobId);
    const state = readJobTimerState(jobId) ?? { running: false, startedAt: null, accumulated: 0, task: "" };
    const elapsed = computeElapsed(state);
    writeJobTimerState(jobId, { running: true, startedAt: Date.now(), accumulated: elapsed, task: nextTask });
    setTick((v) => v + 1);
  };

  const stopActiveTimerAndSave = async () => {
    if (!activeTimer) return;
    const duration =
      activeTimer.kind === "job"
        ? computeElapsed(readJobTimerState(activeTimer.jobId))
        : computeElapsed(readGlobalTimerState());

    const jobId = activeTimer.kind === "job" ? activeTimer.jobId : (activeTimer.jobId ?? null);
    const task =
      activeTimer.kind === "job"
        ? (readJobTimerState(activeTimer.jobId)?.task?.trim() || `Work (${activeTimerLabel})`)
        : activeTimer.task?.trim()
          ? activeTimer.task.trim()
          : "";

    if (duration > 0) {
      try {
        if (task) {
          await fetch("/api/time-logs", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ task, duration, jobId }),
          });
        }
        await qc.invalidateQueries({ queryKey: getGetTimeLogsQueryKey() });
      } catch {
      }
    }

    if (activeTimer.kind === "job") {
      writeJobTimerState(activeTimer.jobId, { running: false, startedAt: null, accumulated: 0, task: "" });
    } else {
      writeGlobalTimerState({ running: false, startedAt: null, accumulated: 0, task: "", jobId: "" });
    }
    setTick((v) => v + 1);
  };

  return (
    <DashboardLayout title="My Dashboard" role="user">
      {/* Top Statistics Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        {[
          { label: "Active Jobs", value: stats.activeJobs, icon: Briefcase, color: "text-primary bg-primary/10" },
          { label: "Completed", value: stats.completedJobs, icon: CheckCircle2, color: "text-emerald-600 bg-emerald-50" },
          { label: "This Week", value: stats.weeklyHours, icon: Clock, color: "text-blue-600 bg-blue-50" },
          { label: "Pending Tasks", value: stats.pendingChecklists, icon: ListChecks, color: "text-amber-600 bg-amber-50" },
          { label: "Rework", value: stats.reworkTasks, icon: AlertTriangle, color: "text-red-600 bg-red-50" },
        ].map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="bg-white p-4 rounded-2xl border border-gray-100 flex flex-col gap-2"
          >
            <div className={`w-9 h-9 rounded-lg ${s.color} flex items-center justify-center shrink-0`}>
              <s.icon size={18} />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">{s.value}</div>
              <div className="text-[11px] text-gray-500 font-medium uppercase tracking-wider">{s.label}</div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* My Active Jobs */}
        <div className="lg:col-span-2 space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl border border-gray-100 overflow-hidden"
          >
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-bold text-gray-900 flex items-center gap-2">
                <Briefcase size={18} className="text-primary" /> My Active Jobs
              </h3>
              <Link href="/user/jobs"><span className="text-xs text-primary font-semibold hover:underline cursor-pointer">View all</span></Link>
            </div>
            <div className="divide-y divide-gray-50">
              {assignedP.pageItems.map((j, i) => (
                <div key={j.id} className="p-5 flex items-center gap-4 group hover:bg-gray-50/50 transition-colors">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary/10 to-sky-100 text-primary flex items-center justify-center font-bold text-xs shrink-0">
                    {j.number?.includes("-") ? j.number.split("-")[1]?.slice(-2) : (j.number?.slice(-2) ?? "??")}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm text-gray-900">{j.title}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{j.number} · {j.client}</div>
                    <div className="text-[10px] text-gray-400 mt-1 flex items-center gap-2">
                      <span className="flex items-center gap-1"><Calendar size={10} /> {j.due}</span>
                      <span className="flex items-center gap-1"><Clock size={10} /> {j.status}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => {
                        void startFromDashboard(j.id);
                      }}
                      className="p-2 bg-primary/10 text-primary rounded-lg hover:bg-primary hover:text-white transition-all"
                      title="Start Timer"
                    >
                      <Play size={14} fill="currentColor" />
                    </motion.button>
                    <Link href={`/user/jobs/${j.id}`}>
                      <motion.button className="p-2 text-gray-400 hover:text-gray-900">
                        <ArrowRight size={16} />
                      </motion.button>
                    </Link>
                  </div>
                </div>
              ))}
              {assignedJobs.length === 0 && (
                <div className="p-12 text-center text-sm text-gray-400">No active jobs assigned</div>
              )}
            </div>
            {assignedJobs.length > 0 && (
              <Pagination page={assignedP.page} totalPages={assignedP.totalPages} total={assignedP.total} pageSize={assignedP.pageSize} onChange={assignedP.setPage} label="jobs" />
            )}
          </motion.div>

          {/* Pending Checklists & Error Reports */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="p-4 border-b border-gray-100 bg-gray-50/50">
                <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <ListChecks size={16} className="text-amber-600" /> Pending Checklists
                </h4>
              </div>
              <div className="p-4 space-y-3">
                {assignedJobs.slice(0, 3).map(j => (
                  <div key={j.id} className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-gray-600 truncate">{j.title}</span>
                    <span className="shrink-0 px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full font-bold">Pending</span>
                  </div>
                ))}
                {assignedJobs.length === 0 && <div className="text-center py-4 text-xs text-gray-400">All caught up</div>}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="p-4 border-b border-gray-100 bg-gray-50/50">
                <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <AlertTriangle size={16} className="text-red-600" /> Recent Error Reports
                </h4>
              </div>
              <div className="p-4 space-y-3">
                {errorReports.slice(0, 3).map(e => (
                  <div key={e.id} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-red-600 uppercase tracking-wider">{e.severity}</span>
                      <span className="text-[10px] text-gray-400">{new Date(e.createdAt).toLocaleDateString()}</span>
                    </div>
                    <p className="text-xs font-semibold text-gray-900 line-clamp-1">{e.title}</p>
                    <p className="text-xs text-gray-600 line-clamp-1">{e.jobNumber ?? "—"} · {e.jobTitle ?? "—"}</p>
                  </div>
                ))}
                {errorReports.length === 0 && <div className="text-center py-4 text-xs text-gray-400">No recent errors</div>}
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar Widgets */}
        <div className="space-y-6">
          {/* Running Timer Widget */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-gradient-to-br from-primary to-sky-700 rounded-2xl p-6 text-white shadow-xl shadow-primary/20 overflow-hidden relative"
          >
            <motion.div
              className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-2xl"
              animate={{ scale: activeTimer?.running ? [1, 1.2, 1] : 1, opacity: activeTimer?.running ? [0.3, 0.5, 0.3] : 0.3 }}
              transition={{ duration: 3, repeat: Infinity }}
            />
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-4">
                <div className={`w-2 h-2 rounded-full ${activeTimer?.running ? "bg-emerald-300 animate-pulse" : "bg-white/40"}`} />
                <span className="text-[10px] font-bold uppercase tracking-[0.2em]">{activeTimer?.running ? "Running Timer" : "Timer Ready"}</span>
              </div>
              <div className="font-mono text-4xl font-bold tabular-nums mb-2">{fmt(activeTimer?.elapsed ?? 0)}</div>
              <div className="text-[11px] text-white/70 mb-6 truncate">{activeTimerLabel}</div>
              <div className="flex gap-2">
                {!activeTimer?.running ? (
                  <button
                    onClick={() => {
                      if (!activeJob?.id) return;
                      void startFromDashboard(activeJob.id);
                    }}
                    className="flex-1 bg-white text-primary py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2"
                  >
                    <Play size={12} fill="currentColor" /> Start Work
                  </button>
                ) : (
                  <button onClick={() => { void stopActiveTimerAndSave(); }} className="flex-1 bg-red-500 text-white py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2">
                    <Square size={12} fill="currentColor" /> Stop Timer
                  </button>
                )}
              </div>
            </div>
          </motion.div>

          {/* Notifications */}
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2"><Bell size={16} className="text-primary" /> Notifications</h4>
              <Link href="/user/notifications"><span className="text-[10px] text-primary font-bold hover:underline cursor-pointer">All</span></Link>
            </div>
            <div className="p-2 space-y-1">
              {notifs.map(n => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => { if (n.unread) void markNotifRead(n.id); }}
                  className={`w-full text-left p-2 rounded-lg hover:bg-gray-50 transition-colors group ${n.unread ? "bg-primary/[0.03]" : ""}`}
                >
                  <div className="flex items-center gap-2">
                    {n.unread && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
                    <div className="text-xs font-bold text-gray-900 group-hover:text-primary transition-colors">{n.title}</div>
                  </div>
                  <div className="text-[10px] text-gray-500 line-clamp-1 mt-0.5">{n.desc}</div>
                </button>
              ))}
              {notifs.length === 0 && <div className="p-8 text-center text-xs text-gray-400">No new alerts</div>}
            </div>
          </div>

          {/* Latest Training */}
          <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-100 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-sm font-bold text-amber-900 flex items-center gap-2"><GraduationCap size={16} /> Latest Training</h4>
              <Link href="/user/training"><ArrowRight size={14} className="text-amber-700" /></Link>
            </div>
            {training.map(t => (
              <div key={t.id} className="bg-white/60 backdrop-blur-sm rounded-xl p-3 border border-amber-200/50 mb-2 last:mb-0">
                <div className="text-xs font-bold text-gray-900">{t.title}</div>
                <div className="text-[10px] text-gray-500 mt-1 line-clamp-2">{t.desc}</div>
              </div>
            ))}
          </div>

          {/* Work Summary */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2 mb-4">
              <TrendingUp size={16} className="text-emerald-600" /> Work Summary
            </h4>
            <div className="space-y-4">
              {[
                { label: "Total Jobs", value: workSummary.totalJobs, icon: Briefcase },
                { label: "Total Hours", value: `${workSummary.totalHours}h`, icon: Clock },
                { label: "Completed (Month)", value: workSummary.monthCompleted, icon: CheckCircle2 },
              ].map(s => (
                <div key={s.label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <s.icon size={14} className="text-gray-400" />
                    <span className="text-xs text-gray-600">{s.label}</span>
                  </div>
                  <span className="text-sm font-bold text-gray-900">{s.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <Dialog
        open={taskDialogOpen}
        onOpenChange={(open) => {
          if (open) setTaskDialogOpen(true);
          else resolveTaskDialog(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Start timer</DialogTitle>
            <DialogDescription>
              Enter the task you are starting.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <input
              value={taskDialogValue}
              onChange={(e) => {
                setTaskDialogValue(e.target.value);
                setTaskDialogError(null);
              }}
              placeholder="e.g. Site inspection notes"
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary"
              autoFocus
            />
            {taskDialogError && (
              <div className="text-xs text-red-600">{taskDialogError}</div>
            )}
          </div>
          <DialogFooter>
            <button
              type="button"
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              onClick={() => resolveTaskDialog(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90"
              onClick={() => {
                const t = taskDialogValue.trim();
                if (!t) {
                  setTaskDialogError("Task is required");
                  return;
                }
                resolveTaskDialog(t);
              }}
            >
              Start
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
