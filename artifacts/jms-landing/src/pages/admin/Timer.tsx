import { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Pause, Square, Plus, Clock, Trash2, Briefcase } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import Pagination, { usePagination } from "@/components/Pagination";
import type { Role } from "@/lib/roles";
import { useAuth } from "@/lib/auth";
import {
  postTimerNotification,
  TIMER_AUTO_STOP_S,
  TIMER_PING_INTERVAL_S,
  timerStillWorkingDescription,
} from "@/lib/timerNotifications";
import {
  useGetTimeLogs,
  useDeleteTimeLog,
  useListJobs,
  getGetJobQueryKey,
  getListJobsQueryKey,
  getGetTimeLogsQueryKey,
  type Job,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatJobPickerLabel } from "@/lib/jobMappers";
import {
  startTimerSession,
  pauseTimerSession,
  stopTimerSession,
  heartbeatTimerSession,
  fetchMyActiveTimerSession,
  liveSessionElapsedSeconds,
  TIMER_HEARTBEAT_INTERVAL_MS,
} from "@/lib/timerSessionApi";
import { handleTimerHeartbeatSideEffects, useTimerHeartbeatOnVisible } from "@/lib/timerHeartbeatEffects";
import { clearOtherJobTimerLocalStates, clearJobTimerState, writeJobTimerState, jobTimerStateFromServerSession } from "@/lib/jobTimerLocalState";

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
  const { user: currentUser } = useAuth();
  const { data: apiLogs, isLoading: logsLoading } = useGetTimeLogs();
  const { data: apiJobs } = useListJobs();
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
  const PING_INTERVAL_S = TIMER_PING_INTERVAL_S;
  const AUTO_STOP_S = TIMER_AUTO_STOP_S;

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
    const serverMine = await fetchMyActiveTimerSession();
    if (serverMine?.segmentStartedAt && serverMine.jobId) {
      const currentLocal = readTimerState()?.jobId;
      if (!currentLocal || serverMine.jobId !== currentLocal) {
        try {
          await stopTimerSession();
        } catch {
          // Server may already have switched sessions.
        }
      }
    }
    clearOtherJobTimerLocalStates();
  };

  const qc = useQueryClient();

  const syncPausedFromServer = (session: { task: string; jobId: string | null; accumulatedSeconds: number; segmentStartedAt: string | null } | null) => {
    setRunning(false);
    if (!session) return;
    const elapsed = liveSessionElapsedSeconds(session);
    setSeconds(elapsed);
    writeTimerState({
      running: false,
      startedAt: null,
      accumulated: elapsed,
      task: session.task,
      jobId: session.jobId ?? "",
    });
    if (session.jobId) {
      writeJobTimerState(session.jobId, {
        running: false,
        startedAt: null,
        accumulated: elapsed,
        task: session.task,
      });
    }
  };

  useTimerHeartbeatOnVisible(running, (payload) => {
    void handleTimerHeartbeatSideEffects(payload, {
      onAutoPaused: syncPausedFromServer,
      onAutoStopped: (duration) => {
        setRunning(false);
        setSeconds(0);
        writeTimerState({ running: false, startedAt: null, accumulated: 0, task: "", jobId: "" });
        if (duration > 0) {
          void qc.invalidateQueries({ queryKey: getGetTimeLogsQueryKey() });
        }
      },
    });
  });

  const startTimer = async () => {
    const t = task.trim();
    if (!t) {
      setStartError("Task is required");
      return;
    }
    if (!jobId) {
      setStartError("Select a job");
      return;
    }

    const serverMine = await fetchMyActiveTimerSession();
    if (serverMine?.jobId === jobId && serverMine.segmentStartedAt) {
      const elapsed = liveSessionElapsedSeconds(serverMine);
      writeTimerState({
        running: true,
        startedAt: serverMine.segmentStartedAt ? Date.parse(serverMine.segmentStartedAt) : null,
        accumulated: serverMine.accumulatedSeconds,
        task: serverMine.task,
        jobId,
      });
      writeJobTimerState(jobId, jobTimerStateFromServerSession(serverMine));
      setRunning(true);
      setSeconds(elapsed);
      setStartError(null);
      return;
    }

    await stopOtherRunningTimersAndSave();

    const session = await startTimerSession({
      jobId,
      task: t,
    });

    if (!session) {
      setStartError("Could not start timer session");
      return;
    }

    setStartError(null);
    const elapsed = liveSessionElapsedSeconds(session);
    writeTimerState({
      running: !!session.segmentStartedAt,
      startedAt: session.segmentStartedAt ? Date.parse(session.segmentStartedAt) : null,
      accumulated: session.accumulatedSeconds,
      task: session.task,
      jobId: session.jobId ?? jobId,
    });
    if (session.jobId) {
      writeJobTimerState(session.jobId, {
        running: !!session.segmentStartedAt,
        startedAt: session.segmentStartedAt ? Date.parse(session.segmentStartedAt) : null,
        accumulated: session.accumulatedSeconds,
        task: session.task,
      });
    }
    setRunning(!!session.segmentStartedAt);
    setSeconds(elapsed);
    await qc.invalidateQueries({ queryKey: getGetJobQueryKey(jobId) });
    await qc.invalidateQueries({ queryKey: getListJobsQueryKey() });
    await qc.invalidateQueries({ queryKey: getGetTimeLogsQueryKey() });
  };

  const pauseTimer = async () => {
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
    await pauseTimerSession().catch(() => {});
  };

  const projects = useMemo(() => {
    return (apiJobs ?? []).map((j: Job) => ({ id: j.id, label: formatJobPickerLabel(j) }));
  }, [apiJobs]);

  useEffect(() => {
    if (projects.length > 0 && !jobId) {
      setJobId(projects[0].id);
    }
  }, [projects, jobId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const mine = await fetchMyActiveTimerSession();
      if (cancelled) return;
      if (mine?.jobId) {
        writeTimerState({
          running: !!mine.segmentStartedAt,
          startedAt: mine.segmentStartedAt ? Date.parse(mine.segmentStartedAt) : null,
          accumulated: mine.accumulatedSeconds,
          task: mine.task,
          jobId: mine.jobId,
        });
        writeJobTimerState(mine.jobId, {
          running: !!mine.segmentStartedAt,
          startedAt: mine.segmentStartedAt ? Date.parse(mine.segmentStartedAt) : null,
          accumulated: mine.accumulatedSeconds,
          task: mine.task,
        });
        setRunning(!!mine.segmentStartedAt);
        setSeconds(liveSessionElapsedSeconds(mine));
        setTask(mine.task);
        setJobId(mine.jobId);
        return;
      }

      const state = readTimerState();
      if (!state) return;
      setRunning(state.running);
      setSeconds(computeElapsed(state));
      setTask(state.task ?? "");
      setJobId(state.jobId ?? "");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const entries: Entry[] = useMemo(() => {
    const logs =
      role === "supervisor" && currentUser?.id
        ? (apiLogs ?? []).filter((l: { userId?: string }) => l.userId === currentUser.id)
        : (apiLogs ?? []);
    return logs.map((l: any) => {
      const job = apiJobs?.find((j: Job) => j.id === l.jobId);
      return {
        id: l.id,
        task: l.task,
        project: job ? formatJobPickerLabel(job) : "General",
        duration: l.duration,
        date: new Date(l.createdAt).toLocaleDateString()
      };
    });
  }, [apiLogs, apiJobs, role, currentUser?.id]);

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
    if (running) return;
    const state = readTimerState();
    if (!state) return;
    writeTimerState({ ...state, task: task.trim(), jobId: jobId || "" });
  }, [task, jobId, running]);

  useEffect(() => {
    if (!running) return;
    const runHeartbeat = () => {
      void heartbeatTimerSession()
        .then((payload) => {
          if (!payload) return;
          return handleTimerHeartbeatSideEffects(payload, {
            onAutoPaused: syncPausedFromServer,
            onAutoStopped: (duration) => {
              setRunning(false);
              setSeconds(0);
              writeTimerState({ running: false, startedAt: null, accumulated: 0, task: "", jobId: "" });
              if (duration > 0) {
                void qc.invalidateQueries({ queryKey: getGetTimeLogsQueryKey() });
              }
            },
          });
        })
        .catch(() => {});
    };
    const id = window.setInterval(runHeartbeat, TIMER_HEARTBEAT_INTERVAL_MS);
    runHeartbeat();
    return () => window.clearInterval(id);
  }, [running, qc]);

  useEffect(() => {
    if (!running) {
      if (pingTimerRef.current) clearTimeout(pingTimerRef.current);
      return;
    }
    pingTimerRef.current = window.setTimeout(() => {
      setShowActivityPing(true);
      setAutoStopCountdown(AUTO_STOP_S);
      const label = projects.find((p) => p.id === jobId)?.label ?? "your task";
      void postTimerNotification(
        "Still working?",
        timerStillWorkingDescription(label),
        jobId || undefined,
      );
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
          void stop().then(() => {
            setShowActivityPing(false);
            const jid = jobId || undefined;
            const label = projects.find((p) => p.id === jid)?.label ?? "your task";
            void postTimerNotification(
              "Timer auto-stopped",
              `Your timer was stopped automatically for ${label} (no response)`,
              jid,
            );
          });
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => { if (autoStopRef.current) clearInterval(autoStopRef.current); };
  }, [showActivityPing, seconds, task, jobId, role]);

  const stop = async () => {
    const jid = (readTimerState()?.jobId ?? jobId) || null;

    try {
      const result = await stopTimerSession();
      setRunning(false);
      setSeconds(0);
      setTask("");
      writeTimerState({ running: false, startedAt: null, accumulated: 0, task: "", jobId: "" });
      if (jid) clearJobTimerState(jid);

      await qc.invalidateQueries({ queryKey: getGetTimeLogsQueryKey() });
      if (jid) {
        await qc.invalidateQueries({ queryKey: getGetJobQueryKey(jid) });
        await qc.invalidateQueries({ queryKey: getListJobsQueryKey() });
      }
      if (result && result.duration > 0) return;
    } catch (err) {
      console.error("Failed to save time log:", err);
      setRunning(false);
      setSeconds(0);
      setTask("");
      writeTimerState({ running: false, startedAt: null, accumulated: 0, task: "", jobId: "" });
      if (jid) clearJobTimerState(jid);
    }
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
                <div className="text-xs font-bold uppercase tracking-wider text-gray-500">Activity check-in</div>
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
                disabled={running}
                className="bg-white/5 border-2 border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-primary disabled:opacity-60 disabled:cursor-not-allowed"
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
                  className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all"
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
