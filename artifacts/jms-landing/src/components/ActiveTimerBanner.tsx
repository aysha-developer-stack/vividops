import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Timer } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  fetchMyActiveTimerSession,
  liveSessionElapsedSeconds,
  TIMER_HEARTBEAT_INTERVAL_MS,
  type ActiveTimerSession,
} from "@/lib/timerSessionApi";
import { ROLES, type Role } from "@/lib/roles";

function formatTime(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function isViewingActiveJob(location: string, jobId: string, base: string): boolean {
  const prefix = `${base}/jobs/`;
  if (!location.startsWith(prefix)) return false;
  const rest = location.slice(prefix.length);
  const id = rest.split("/")[0]?.split("?")[0];
  return id === jobId;
}

function isDedicatedTimerPage(location: string, base: string): boolean {
  return location === `${base}/timer` || location.startsWith(`${base}/timer?`);
}

export default function ActiveTimerBanner({ role }: { role: Role }) {
  const [location] = useLocation();
  const base = ROLES[role].base;
  const [session, setSession] = useState<ActiveTimerSession | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const next = await fetchMyActiveTimerSession();
      if (!cancelled) setSession(next);
    };

    void load();
    const intervalId = window.setInterval(() => void load(), TIMER_HEARTBEAT_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  useEffect(() => {
    if (!session?.segmentStartedAt) return;
    const intervalId = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(intervalId);
  }, [session?.segmentStartedAt, session?.accumulatedSeconds]);

  const isRunning = !!session?.jobId && !!session.segmentStartedAt;
  const hidden =
    !isRunning ||
    !session?.jobId ||
    isViewingActiveJob(location, session.jobId, base) ||
    isDedicatedTimerPage(location, base);

  const elapsed = session ? liveSessionElapsedSeconds(session) : 0;
  const jobLabel = session?.jobNumber ?? "this job";
  const href = session?.jobId ? `${base}/jobs/${session.jobId}` : base;

  return (
    <AnimatePresence>
      {!hidden && session && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2 }}
          className="overflow-hidden"
        >
          <div className="bg-primary text-white px-4 md:px-6 py-2.5 flex items-center justify-between gap-3 shadow-md border-b border-white/10">
            <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-green-400" />
              </span>
              <Timer size={16} className="shrink-0 opacity-90 hidden sm:block" />
              <div className="min-w-0 flex-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                <span className="font-medium truncate">
                  Timer running on <span className="font-bold">{jobLabel}</span>
                </span>
                {session.task?.trim() ? (
                  <span className="text-white/80 truncate hidden md:inline">· {session.task.trim()}</span>
                ) : null}
                <span className="font-mono tabular-nums font-bold text-base">{formatTime(elapsed)}</span>
              </div>
            </div>
            <Link href={href}>
              <button
                type="button"
                className="shrink-0 px-3 py-1.5 bg-white text-primary hover:bg-white/90 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap"
              >
                Go to job →
              </button>
            </Link>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
