import { useEffect, useRef } from "react";
import { pauseTimerSession, type ActiveTimerSession } from "./timerSessionApi";

/** Pause the server timer when the tab is hidden or the device sleeps. */
export function useTimerAutoPauseOnHide(
  enabled: boolean,
  onPaused?: (session: ActiveTimerSession | null) => void,
): void {
  const onPausedRef = useRef(onPaused);
  onPausedRef.current = onPaused;

  useEffect(() => {
    if (!enabled) return;

    const pauseIfHidden = () => {
      if (document.visibilityState !== "hidden") return;
      void pauseTimerSession()
        .then((session) => {
          onPausedRef.current?.(session);
        })
        .catch(() => {});
    };

    document.addEventListener("visibilitychange", pauseIfHidden);
    window.addEventListener("pagehide", pauseIfHidden);
    return () => {
      document.removeEventListener("visibilitychange", pauseIfHidden);
      window.removeEventListener("pagehide", pauseIfHidden);
    };
  }, [enabled]);
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
