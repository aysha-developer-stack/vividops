import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchMyActiveTimerSession,
  liveSessionElapsedSeconds,
  TIMER_HEARTBEAT_INTERVAL_MS,
  type ActiveTimerSession,
} from "@/lib/timerSessionApi";
import {
  applyServerTimerToJob,
  dispatchTimerSessionSync,
  jobTimerStateFromServerSession,
  TIMER_SESSION_SYNC_EVENT,
  writeJobTimerState,
} from "@/lib/jobTimerLocalState";

type Options = {
  /** Current job page — omit on the dedicated Timer page (any job). */
  jobId?: string;
  enabled: boolean;
};

/**
 * Timer display driven by the server session snapshot, not localStorage wall clock.
 * Prevents the UI from showing hours of "running" time after the server auto-paused.
 */
export function useServerAuthoritativeTimer({ jobId, enabled }: Options) {
  const [running, setRunning] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [task, setTask] = useState("");
  const sessionRef = useRef<ActiveTimerSession | null>(null);

  const applySession = useCallback(
    (session: ActiveTimerSession | null) => {
      sessionRef.current = session;

      if (jobId) {
        const applied = applyServerTimerToJob(jobId, session);
        setRunning(applied.running);
        setSeconds(applied.seconds);
        setTask(session?.jobId === jobId ? session.task ?? "" : "");
        return applied;
      }

      if (!session?.segmentStartedAt) {
        setRunning(false);
        setSeconds(session?.accumulatedSeconds ?? 0);
        setTask(session?.task ?? "");
        return { running: false, seconds: session?.accumulatedSeconds ?? 0, paused: false };
      }

      setRunning(true);
      setSeconds(liveSessionElapsedSeconds(session));
      setTask(session.task ?? "");
      if (session.jobId) {
        writeJobTimerState(session.jobId, jobTimerStateFromServerSession(session));
      }
      return { running: true, seconds: liveSessionElapsedSeconds(session), paused: false };
    },
    [jobId],
  );

  const refresh = useCallback(async () => {
    if (!enabled) return null;
    const session = await fetchMyActiveTimerSession();
    applySession(session);
    dispatchTimerSessionSync(session);
    return session;
  }, [applySession, enabled]);

  useEffect(() => {
    if (!enabled) {
      sessionRef.current = null;
      setRunning(false);
      setSeconds(0);
      setTask("");
      return;
    }

    void refresh();

    const intervalId = window.setInterval(() => {
      void refresh();
    }, TIMER_HEARTBEAT_INTERVAL_MS);

    const onSync = (event: Event) => {
      const session = (event as CustomEvent<ActiveTimerSession | null>).detail ?? null;
      if (jobId && session && session.jobId !== jobId) {
        applySession(null);
        return;
      }
      applySession(session);
    };

    window.addEventListener(TIMER_SESSION_SYNC_EVENT, onSync);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener(TIMER_SESSION_SYNC_EVENT, onSync);
    };
  }, [applySession, enabled, jobId, refresh]);

  useEffect(() => {
    if (!enabled || !running) return;
    const intervalId = window.setInterval(() => {
      const session = sessionRef.current;
      if (!session?.segmentStartedAt) return;
      if (jobId && session.jobId !== jobId) return;
      setSeconds(liveSessionElapsedSeconds(session));
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [enabled, jobId, running]);

  return { running, setRunning, seconds, setSeconds, task, setTask, refresh, sessionRef };
}
