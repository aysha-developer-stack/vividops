import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetTimeLogsQueryKey } from "@workspace/api-client-react";
import {
  fetchMyActiveTimerSession,
  heartbeatTimerSession,
  TIMER_HEARTBEAT_INTERVAL_MS,
  type ActiveTimerSession,
} from "@/lib/timerSessionApi";
import { handleTimerHeartbeatSideEffects } from "@/lib/timerHeartbeatEffects";
import {
  writeJobTimerState,
  jobTimerStateFromServerSession,
  dispatchTimerSessionSync,
} from "@/lib/jobTimerLocalState";

function sessionHeartbeatMs(session: ActiveTimerSession | null | undefined): number {
  if (!session?.lastHeartbeatAt) return 0;
  const ms = Date.parse(session.lastHeartbeatAt);
  return Number.isFinite(ms) ? ms : 0;
}

function isSessionAtLeastAsFresh(
  incoming: ActiveTimerSession | null,
  current: ActiveTimerSession | null,
): boolean {
  if (!current) return true;
  if (!incoming) return true;
  if (incoming.id !== current.id) return true;
  return sessionHeartbeatMs(incoming) >= sessionHeartbeatMs(current);
}

/**
 * Keep the server work timer alive while the user navigates anywhere in OPS.
 * Without this, heartbeats only run on Job Detail / Timer pages and elapsed
 * time can be lost when switching pages or restarting the timer.
 */
export function useGlobalTimerHeartbeat(enabled: boolean): void {
  const qc = useQueryClient();
  const sessionRef = useRef<ActiveTimerSession | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    const publishSession = (session: ActiveTimerSession | null, force = false) => {
      if (!force && !isSessionAtLeastAsFresh(session, sessionRef.current)) return;
      sessionRef.current = session;
      dispatchTimerSessionSync(session);
      if (session?.jobId) {
        writeJobTimerState(session.jobId, jobTimerStateFromServerSession(session));
      }
    };

    const refreshSessionState = async (): Promise<ActiveTimerSession | null> => {
      const session = await fetchMyActiveTimerSession();
      if (cancelled) return null;
      publishSession(session);
      return session;
    };

    const sendHeartbeat = async () => {
      const payload = await heartbeatTimerSession().catch(() => null);
      if (cancelled || !payload) {
        if (!payload) publishSession(null);
        return;
      }

      if (payload.autoStopped) {
        publishSession(null);
        void qc.invalidateQueries({ queryKey: getGetTimeLogsQueryKey() });
        return;
      }

      publishSession(payload, true);

      await handleTimerHeartbeatSideEffects(payload, {
        onAutoPaused: (session) => {
          publishSession(session, true);
          void qc.invalidateQueries({ queryKey: getGetTimeLogsQueryKey() });
        },
        onAutoStopped: () => {
          publishSession(null);
          void qc.invalidateQueries({ queryKey: getGetTimeLogsQueryKey() });
        },
      });
    };

    const tick = async () => {
      const session = await refreshSessionState();
      if (session?.segmentStartedAt) {
        await sendHeartbeat();
      }
    };

    void tick();
    const intervalId = window.setInterval(() => {
      void tick();
    }, TIMER_HEARTBEAT_INTERVAL_MS);

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void tick();
    };
    const onFocus = () => {
      void tick();
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
    };
  }, [enabled, qc]);
}
