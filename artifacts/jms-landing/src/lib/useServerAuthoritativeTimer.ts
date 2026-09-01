import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchMyActiveTimerSession,
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

function isSessionRunning(
  session: Pick<ActiveTimerSession, "segmentStartedAt" | "trackingPaused"> | null | undefined,
): boolean {
  if (!session?.segmentStartedAt) return false;
  return !session.trackingPaused;
}

function sessionHeartbeatMs(session: ActiveTimerSession | null | undefined): number {
  if (!session?.lastHeartbeatAt) return 0;
  const ms = Date.parse(session.lastHeartbeatAt);
  return Number.isFinite(ms) ? ms : 0;
}

/** Ignore out-of-order timer API responses (e.g. pause applied then stale "running" fetch returns). */
function isSessionAtLeastAsFresh(
  incoming: ActiveTimerSession | null,
  current: ActiveTimerSession | null,
): boolean {
  if (!current) return true;
  if (!incoming) return true;
  if (incoming.id !== current.id) return true;
  return sessionHeartbeatMs(incoming) >= sessionHeartbeatMs(current);
}

function syncSegmentRefs(
  session: ActiveTimerSession | null,
  accumulatedRef: { current: number },
  segmentStartedAtMsRef: { current: number | null },
): void {
  if (!session || !isSessionRunning(session)) {
    accumulatedRef.current = Math.max(0, session?.accumulatedSeconds ?? 0);
    segmentStartedAtMsRef.current = null;
    return;
  }
  accumulatedRef.current = Math.max(0, session.accumulatedSeconds ?? 0);
  const segMs = new Date(session.segmentStartedAt!).getTime();
  segmentStartedAtMsRef.current = Number.isFinite(segMs) ? segMs : null;
}

function elapsedFromSegmentRefs(
  accumulatedRef: { current: number },
  segmentStartedAtMsRef: { current: number | null },
  nowMs = Date.now(),
): number {
  const base = Math.max(0, accumulatedRef.current);
  if (segmentStartedAtMsRef.current == null) return base;
  return base + Math.max(0, Math.floor((nowMs - segmentStartedAtMsRef.current) / 1000));
}

/**
 * Timer display driven by the server session snapshot, not localStorage wall clock.
 * Prevents the UI from showing hours of "running" time after the server auto-paused.
 */
export function useServerAuthoritativeTimer({ jobId, enabled }: Options) {
  const [running, setRunning] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [task, setTask] = useState("");
  const sessionRef = useRef<ActiveTimerSession | null>(null);
  const refreshGenRef = useRef(0);
  const accumulatedSecondsRef = useRef(0);
  const segmentStartedAtMsRef = useRef<number | null>(null);

  const applySession = useCallback(
    (session: ActiveTimerSession | null, opts?: { bumpRefreshGeneration?: boolean; force?: boolean }) => {
      if (opts?.bumpRefreshGeneration) {
        refreshGenRef.current += 1;
      }

      if (!opts?.force && !isSessionAtLeastAsFresh(session, sessionRef.current)) {
        return {
          running: sessionRef.current ? isSessionRunning(sessionRef.current) : false,
          seconds: sessionRef.current
            ? elapsedFromSegmentRefs(accumulatedSecondsRef, segmentStartedAtMsRef)
            : 0,
          paused: false,
        };
      }

      sessionRef.current = session;
      syncSegmentRefs(session, accumulatedSecondsRef, segmentStartedAtMsRef);

      if (jobId) {
        const applied = applyServerTimerToJob(jobId, session);
        setRunning(applied.running);
        setSeconds(applied.seconds);
        setTask(session?.jobId === jobId ? session.task ?? "" : "");
        return applied;
      }

      const sessionRunning = isSessionRunning(session);
      if (!sessionRunning) {
        setRunning(false);
        setSeconds(session?.accumulatedSeconds ?? 0);
        setTask(session?.task ?? "");
        return { running: false, seconds: session?.accumulatedSeconds ?? 0, paused: false };
      }

      const liveSeconds = elapsedFromSegmentRefs(
        accumulatedSecondsRef,
        segmentStartedAtMsRef,
      );
      setRunning(true);
      setSeconds(liveSeconds);
      setTask(session!.task ?? "");
      if (session!.jobId) {
        writeJobTimerState(session!.jobId, jobTimerStateFromServerSession(session!));
      }
      return { running: true, seconds: liveSeconds, paused: false };
    },
    [jobId],
  );

  const refresh = useCallback(async () => {
    if (!enabled) return null;
    const gen = ++refreshGenRef.current;
    const session = await fetchMyActiveTimerSession();
    if (gen !== refreshGenRef.current) return session;
    applySession(session);
    dispatchTimerSessionSync(session);
    return session;
  }, [applySession, enabled]);

  useEffect(() => {
    if (!enabled) {
      sessionRef.current = null;
      accumulatedSecondsRef.current = 0;
      segmentStartedAtMsRef.current = null;
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
        applySession(null, { bumpRefreshGeneration: true, force: true });
        return;
      }
      applySession(session, { bumpRefreshGeneration: true, force: true });
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
      if (jobId && sessionRef.current && sessionRef.current.jobId !== jobId) return;
      setSeconds(elapsedFromSegmentRefs(accumulatedSecondsRef, segmentStartedAtMsRef));
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [enabled, jobId, running]);

  return { running, setRunning, seconds, setSeconds, task, setTask, refresh, sessionRef };
}
