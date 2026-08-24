import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetTimeLogsQueryKey } from "@workspace/api-client-react";
import {
  fetchMyActiveTimerSession,
  heartbeatTimerSession,
  TIMER_HEARTBEAT_INTERVAL_MS,
} from "@/lib/timerSessionApi";
import { handleTimerHeartbeatSideEffects } from "@/lib/timerHeartbeatEffects";
import { writeJobTimerState, jobTimerStateFromServerSession, computeJobTimerElapsed } from "@/lib/jobTimerLocalState";

/**
 * Keep the server work timer alive while the user navigates anywhere in OPS.
 * Without this, heartbeats only run on Job Detail / Timer pages and elapsed
 * time can be lost when switching pages or restarting the timer.
 */
export function useGlobalTimerHeartbeat(enabled: boolean): void {
  const qc = useQueryClient();
  const sessionRunningRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    const refreshSessionState = async () => {
      const session = await fetchMyActiveTimerSession();
      if (cancelled) return;
      sessionRunningRef.current = !!session?.segmentStartedAt;
      if (session?.jobId) {
        const synced = jobTimerStateFromServerSession(session);
        writeJobTimerState(session.jobId, synced);
      }
    };

    const sendHeartbeat = () => {
      void heartbeatTimerSession()
        .then((payload) => {
          if (!payload) {
            sessionRunningRef.current = false;
            return;
          }
          sessionRunningRef.current = !!payload.segmentStartedAt;
          if (payload.jobId) {
            writeJobTimerState(payload.jobId, jobTimerStateFromServerSession(payload));
          }
          return handleTimerHeartbeatSideEffects(payload, {
            onAutoPaused: (session) => {
              sessionRunningRef.current = false;
              if (session.jobId) {
                writeJobTimerState(session.jobId, {
                  ...jobTimerStateFromServerSession(session),
                  running: false,
                  startedAt: null,
                  accumulated: computeJobTimerElapsed(jobTimerStateFromServerSession(session)),
                });
              }
              void qc.invalidateQueries({ queryKey: getGetTimeLogsQueryKey() });
            },
            onAutoStopped: () => {
              sessionRunningRef.current = false;
              void qc.invalidateQueries({ queryKey: getGetTimeLogsQueryKey() });
            },
          });
        })
        .catch(() => {});
    };

    const tick = async () => {
      await refreshSessionState();
      if (sessionRunningRef.current) sendHeartbeat();
    };

    void tick();
    const intervalId = window.setInterval(() => {
      void tick();
    }, TIMER_HEARTBEAT_INTERVAL_MS);

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void tick();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, qc]);
}
