import { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Pause, Square, Plus, Clock, Trash2, Briefcase } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import Pagination, { usePagination } from "@/components/Pagination";
import type { Role } from "@/lib/roles";
import { useGetTimeLogs, useCreateTimeLog, useDeleteTimeLog, useListJobs, type Job } from "@workspace/api-client-react";

interface Entry {
  id: string;
  task: string;
  project: string;
  duration: number;
  date: string;
}

function formatTime(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function formatShort(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function Timer({ role = "super-admin" as Role }: { role?: Role } = {}) {
  const { data: apiLogs, isLoading: logsLoading } = useGetTimeLogs();
  const { data: apiJobs } = useListJobs();
  const createLogMutation = useCreateTimeLog();
  const deleteLogMutation = useDeleteTimeLog();

  const [running, setRunning] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [task, setTask] = useState("");
  const [jobId, setJobId] = useState<string>("");
  const [startError, setStartError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [showActivityPing, setShowActivityPing] = useState(false);
  const [autoStopCountdown, setAutoStopCountdown] = useState(300);
  const pingTimerRef = useRef<number | null>(null);
  const autoStopRef = useRef<number | null>(null);
  const PING_INTERVAL_S = 3600;
  const AUTO_STOP_S = 300;

  const timerStorageKey = "global_timer_v1";
  const readTimerState = () => {
    try {
      const raw = localStorage.getItem(timerStorageKey);
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
  const writeTimerState = (state: { running: boolean; startedAt: number | null; accumulated: number; task: string; jobId: string }) => {
    try {
      localStorage.setItem(timerStorageKey, JSON.stringify({ v: 1, ...state }));
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

  const stopOtherRunningTimersAndSave = async () => {
    const runningJobTimers: Array<{ jobId: string; elapsed: number }> = [];
    const runningJobTimerTasks = new Map<string, string>();
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith("job_timer_v1:")) continue;
      const jid = key.slice("job_timer_v1:".length);
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const data = JSON.parse(raw) as any;
        if (!data || data.v !== 1 || !data.running) continue;
        const startedAt = typeof data.startedAt === "number" ? data.startedAt : null;
        const accumulated = typeof data.accumulated === "number" ? data.accumulated : 0;
        const t = typeof data.task === "string" ? data.task : "";
        const elapsed = computeElapsed({ running: true, startedAt, accumulated });
        if (t.trim()) runningJobTimerTasks.set(jid, t.trim());
        if (elapsed > 0) runningJobTimers.push({ jobId: jid, elapsed });
      } catch {
      }
    }

    for (const jt of runningJobTimers) {
      const label =
        projects.find((p) => p.id === jt.jobId)?.label ??
        `Job ${jt.jobId.slice(0, 8)}…`;
      const task = runningJobTimerTasks.get(jt.jobId) ?? `Work (${label})`;
      try {
        await createLogMutation.mutateAsync({
          data: { task, duration: jt.elapsed, jobId: jt.jobId },
        });
      } catch {
      } finally {
        try {
          localStorage.setItem(
            `job_timer_v1:${jt.jobId}`,
            JSON.stringify({ v: 1, running: false, startedAt: null, accumulated: 0, task: "" }),
          );
        } catch {
        }
      }
    }
  };

  const startTimer = async () => {
    const t = task.trim();
    if (!t) {
      setStartError("Task is required");
      return;
    }
    await stopOtherRunningTimersAndSave();
    const prev = readTimerState() ?? { running: false, startedAt: null, accumulated: 0, task: "", jobId: "" };
    const elapsed = computeElapsed(prev);
    writeTimerState({
      running: true,
      startedAt: Date.now(),
      accumulated: elapsed,
      task: t,
      jobId: jobId || "",
    });
    setRunning(true);
    setSeconds(elapsed);
  };

  const pauseTimer = () => {
    const prev = readTimerState() ?? { running: false, startedAt: null, accumulated: 0, task: "", jobId: "" };
    const elapsed = computeElapsed(prev);
    writeTimerState({
      running: false,
      startedAt: null,
      accumulated: elapsed,
      task: task.trim(),
      jobId: jobId || "",
    });
    setRunning(false);
    setSeconds(elapsed);
  };

  const projects = useMemo(() => {
    return (apiJobs ?? []).map((j: Job) => ({ id: j.id, label: `${j.title} (${j.number})` }));
  }, [apiJobs]);

  useEffect(() => {
    if (projects.length > 0 && !jobId) {
      setJobId(projects[0].id);
    }
  }, [projects, jobId]);

  useEffect(() => {
    const state = readTimerState();
    if (!state) return;
    setRunning(state.running);
    setSeconds(computeElapsed(state));
    setTask(state.task ?? "");
    setJobId(state.jobId ?? "");
  }, []);

  const entries: Entry[] = useMemo(() => {
    return (apiLogs ?? []).map((l: any) => {
      const job = apiJobs?.find((j: Job) => j.id === l.jobId);
      return {
        id: l.id,
        task: l.task,
        project: job ? `${job.title} (${job.number})` : "General",
        duration: l.duration,
        date: new Date(l.createdAt).toLocaleDateString()
      };
    });
  }, [apiLogs, apiJobs]);

  useEffect(() => {
    if (!running) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
      const state = readTimerState();
      if (state) setSeconds(computeElapsed(state));
      return;
    }
    intervalRef.current = setInterval(() => {
      const state = readTimerState();
      setSeconds(computeElapsed(state));
    }, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running]);

  useEffect(() => {
    const state = readTimerState();
    if (!state) return;
    writeTimerState({ ...state, task: task.trim(), jobId: jobId || "" });
  }, [task, jobId]);

  useEffect(() => {
    if (!running) {
      if (pingTimerRef.current) clearTimeout(pingTimerRef.current);
      return;
    }
    pingTimerRef.current = window.setTimeout(() => {
      setShowActivityPing(true);
      setAutoStopCountdown(AUTO_STOP_S);
    }, PING_INTERVAL_S * 1000);
    return () => { if (pingTimerRef.current) clearTimeout(pingTimerRef.current); };
  }, [running, Math.floor(seconds / PING_INTERVAL_S)]);

  useEffect(() => {
    if (!showActivityPing) {
      if (autoStopRef.current) clearInterval(autoStopRef.current);
      return;
    }
    autoStopRef.current = window.setInterval(() => {
      setAutoStopCountdown((c) => {
        if (c <= 1) {
          const state = readTimerState();
          const duration = computeElapsed(state);
          const t = (state?.task ?? task).trim() ? (state?.task ?? task).trim() : "Auto-stopped (no response)";
          const jid = (state?.jobId ?? jobId) || null;
          setRunning(false);
          setSeconds(0);
          setTask("");
          setShowActivityPing(false);
          writeTimerState({ running: false, startedAt: null, accumulated: 0, task: "", jobId: "" });
          if (duration > 0) {
            createLogMutation
              .mutateAsync({ data: { task: t, duration, jobId: jid } })
              .then(() => {
                if (role === "user") {
                  fetch("/api/notifications", {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      type: "timer",
                      title: "Timer auto-stopped",
                      description: "Your timer was stopped automatically (no response)",
                    }),
                  }).catch(() => {});
                }
              })
              .catch(() => {});
          }
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => { if (autoStopRef.current) clearInterval(autoStopRef.current); };
  }, [showActivityPing, seconds, task, jobId, createLogMutation, role]);

  const stop = async () => {
    const state = readTimerState();
    const duration = computeElapsed(state);
    const t = (state?.task ?? task).trim();
    const jid = (state?.jobId ?? jobId) || null;
    if (duration > 0 && t) {
      try {
        await createLogMutation.mutateAsync({
          data: {
            task: t,
            duration,
            jobId: jid,
          }
        });
      } catch (err) {
        console.error("Failed to save time log:", err);
      }
    }
    setRunning(false);
    setSeconds(0);
    setTask("");
    writeTimerState({ running: false, startedAt: null, accumulated: 0, task: "", jobId: "" });
  };

  const remove = async (id: string) => {
    try {
      await deleteLogMutation.mutateAsync({ id });
    } catch (err) {
      console.error("Failed to delete time log:", err);
    }
  };

  const todayTotal = entries.filter((e) => e.date === new Date().toLocaleDateString()).reduce((acc, e) => acc + e.duration, 0);
  const weekTotal = entries.reduce((acc, e) => acc + e.duration, 0);
  const entriesP = usePagination(entries, 6);

  if (logsLoading) {
    return (
      <DashboardLayout title="Time Tracker" role={role}>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Time Tracker" role={role}>
      <AnimatePresence>
        {showActivityPing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          >
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              className="w-full max-w-md bg-white rounded-2xl border border-gray-100 shadow-2xl overflow-hidden"
            >
              <div className="p-5 border-b border-gray-100">
                <div className="text-xs font-bold uppercase tracking-wider text-gray-500">Hourly check-in</div>
                <div className="text-lg font-bold text-gray-900 mt-1">Are you still working?</div>
                <div className="text-xs text-gray-500 mt-1">Timer will auto-stop in {autoStopCountdown}s if there’s no response.</div>
              </div>
              <div className="p-5 flex gap-2">
                <button
                  onClick={() => { setShowActivityPing(false); setAutoStopCountdown(AUTO_STOP_S); }}
                  className="flex-1 py-2.5 bg-primary text-white text-sm font-bold rounded-xl"
                >
                  Yes, keep tracking
                </button>
                <button
                  onClick={async () => { setShowActivityPing(false); await stop(); }}
                  className="flex-1 py-2.5 bg-gray-100 text-gray-800 text-sm font-bold rounded-xl"
                >
                  Stop timer
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Timer card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="lg:col-span-2 relative bg-gradient-to-br from-black via-gray-900 to-black rounded-2xl p-8 border border-gray-800 overflow-hidden"
        >
          <motion.div
            className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-primary/20 blur-3xl"
            animate={{ scale: running ? [1, 1.3, 1] : 1, opacity: running ? [0.5, 0.9, 0.5] : 0.4 }}
            transition={{ duration: 2, repeat: Infinity }}
          />
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-6">
              <div className={`w-2 h-2 rounded-full ${running ? "bg-emerald-400" : "bg-gray-500"}`} />
              <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                {running ? "Tracking time" : "Ready"}
              </span>
            </div>

            <div className="font-mono text-6xl md:text-7xl font-bold text-white tabular-nums mb-8">
              {formatTime(seconds)}
            </div>

            <div className="grid sm:grid-cols-2 gap-3 mb-6">
              <input
                value={task}
                onChange={(e) => {
                  setTask(e.target.value);
                  setStartError(null);
                }}
                placeholder="What are you working on?"
                className="bg-white/5 border-2 border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-primary"
              />
              <select
                value={jobId}
                onChange={(e) => setJobId(e.target.value)}
                className="bg-white/5 border-2 border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-primary"
              >
                <option value="" className="bg-black">General / No Project</option>
                {projects.map((p) => <option key={p.id} value={p.id} className="bg-black">{p.label}</option>)}
              </select>
            </div>

            <div className="flex gap-3">
              <motion.button
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                onClick={() => {
                  if (running) pauseTimer();
                  else void startTimer();
                }}
                className={`flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm shadow-lg transition-colors ${running ? "bg-amber-500 text-white shadow-amber-500/40 hover:bg-amber-600" : "bg-primary text-white shadow-primary/40 hover:bg-primary/90"}`}
              >
                {running ? <><Pause size={16} /> Pause</> : <><Play size={16} /> Start</>}
              </motion.button>
              {seconds > 0 && (
                <motion.button
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={stop}
                  className="flex items-center gap-2 px-6 py-3 bg-white/10 border border-white/10 hover:bg-white/15 text-white rounded-xl font-semibold text-sm"
                >
                  <Square size={14} /> Stop & Save
                </motion.button>
              )}
            </div>
            {startError && (
              <div className="mt-3 text-xs text-red-300">
                {startError}
              </div>
            )}
          </div>
        </motion.div>

        {/* Totals */}
        <div className="space-y-4">
          {[
            { label: "Today", value: formatShort(todayTotal), color: "from-primary to-sky-700" },
            { label: "This week", value: formatShort(weekTotal), color: "from-emerald-500 to-emerald-700" },
            { label: "Entries", value: `${entries.length}`, color: "from-amber-500 to-orange-600" },
          ].map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 + i * 0.06 }}
              whileHover={{ y: -3, boxShadow: "0 12px 24px rgba(0,0,0,0.06)" }}
              className="bg-white border border-gray-100 rounded-2xl p-5 relative overflow-hidden"
            >
              <div className={`absolute top-0 right-0 w-24 h-24 rounded-full bg-gradient-to-br ${s.color} opacity-5 blur-2xl`} />
              <div className="relative z-10">
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">{s.label}</div>
                <div className="text-2xl font-bold text-gray-900 mt-1">{s.value}</div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Entries list */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-gray-900">Recent Entries</h3>
            <p className="text-xs text-gray-500 mt-0.5">Time logged across your projects</p>
          </div>
          <span className="text-xs text-gray-500 font-medium">{entries.length} entries</span>
        </div>
        <div>
          <AnimatePresence>
            {entriesP.pageItems.map((e, i) => (
              <motion.div
                key={e.id}
                layout
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ delay: i * 0.04 }}
                whileHover={{ backgroundColor: "rgb(249, 250, 251)" }}
                className="flex items-center gap-4 px-5 py-4 border-b border-gray-50 last:border-0 group"
              >
                <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Briefcase size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900">{e.task}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{e.project}</div>
                </div>
                <div className="hidden sm:flex items-center gap-1.5 text-xs text-gray-500">
                  <Clock size={12} />
                  {e.date}
                </div>
                <div className="font-mono text-sm font-semibold text-gray-900 tabular-nums w-20 text-right">
                  {formatTime(e.duration)}
                </div>
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => remove(e.id)}
                  className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                >
                  <Trash2 size={14} />
                </motion.button>
              </motion.div>
            ))}
          </AnimatePresence>
          {entries.length === 0 && (
            <div className="text-center py-12 text-sm text-gray-400">No entries yet — start the timer above.</div>
          )}
        </div>
        <Pagination page={entriesP.page} totalPages={entriesP.totalPages} total={entriesP.total} pageSize={entriesP.pageSize} onChange={entriesP.setPage} label="entries" />
      </motion.div>
    </DashboardLayout>
  );
}
