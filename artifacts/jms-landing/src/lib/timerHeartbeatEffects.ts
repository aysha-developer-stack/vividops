import { useEffect } from "react";
import { heartbeatTimerSession, type ActiveTimerSession } from "./timerSessionApi";

/**
 * Timer keeps running when the user switches tabs or minimizes the browser.
 * Sleep / offline is handled server-side: if heartbeats stop for ~90s, the next
 * heartbeat auto-pauses without counting the gap.
 *
 * When the user returns to this tab, send an immediate heartbeat so sleep is
 * detected and the UI syncs quickly.
 */
export function useTimerHeartbeatOnVisible(
  enabled: boolean,
  onHeartbeat?: (payload: ActiveTimerSession & { autoPaused?: boolean; autoStopped?: boolean; duration?: number }) => void,
): void {
  useEffect(() => {
    if (!enabled || !onHeartbeat) return;

    const pingOnVisible = () => {
      if (document.visibilityState !== "visible") return;
      void heartbeatTimerSession()
        .then((payload) => {
          if (payload) onHeartbeat(payload);
        })
        .catch(() => {});
    };

    document.addEventListener("visibilitychange", pingOnVisible);
    return () => document.removeEventListener("visibilitychange", pingOnVisible);
  }, [enabled, onHeartbeat]);
}

export async function handleTimerHeartbeatSideEffects(
  payload: ActiveTimerSession & { autoPaused?: boolean; autoStopped?: boolean; duration?: number },
  opts: {
    onAutoPaused?: (session: ActiveTimerSession) => void;
    onAutoStopped?: (duration: number) => void;
  },
): Promise<ActiveTimerSession | null> {
  if (payload.autoStopped) {
    opts.onAutoStopped?.(payload.duration ?? 0);
    return null;
  }
  if (payload.autoPaused) {
    opts.onAutoPaused?.(payload);
    return payload;
  }
  return payload;
}
