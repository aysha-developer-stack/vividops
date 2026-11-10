import { useCallback, useEffect, useRef, useState } from "react";
import {
  postTimerNotification,
  TIMER_AUTO_STOP_S,
  TIMER_PING_INTERVAL_S,
  timerStillWorkingDescription,
} from "@/lib/timerNotifications";
import { isDocumentVisible, remainingDeadlineSeconds } from "@/lib/timerActivityPing";

/**
 * Remind after a stretch of running time. Auto-pause only if the popup is
 * visible and ignored — a background CAD tab must not stop the timer.
 */
export function useTimerActivityPing({
  running,
  jobLabel,
  jobId,
  onIdle,
  onAutoStop,
}: {
  running: boolean;
  elapsedSeconds?: number;
  jobLabel: string;
  jobId?: string | null;
  onAutoStop?: () => void | Promise<void>;
  onIdle?: () => void | Promise<void>;
}) {
  const idleHandler = onIdle ?? onAutoStop;
  const [showActivityPing, setShowActivityPing] = useState(false);
  const [autoStopCountdown, setAutoStopCountdown] = useState(TIMER_AUTO_STOP_S);
  const pingTimerRef = useRef<number | null>(null);
  const countdownRef = useRef<number | null>(null);
  const deadlineMsRef = useRef<number | null>(null);
  const idleFiredRef = useRef(false);
  const onIdleRef = useRef(idleHandler);
  onIdleRef.current = idleHandler;

  const clearPingTimer = () => {
    if (pingTimerRef.current) {
      window.clearTimeout(pingTimerRef.current);
      pingTimerRef.current = null;
    }
  };

  const clearCountdown = () => {
    if (countdownRef.current) {
      window.clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  };

  const schedulePing = useCallback(() => {
    clearPingTimer();
    pingTimerRef.current = window.setTimeout(() => {
      idleFiredRef.current = false;
      setShowActivityPing(true);
      setAutoStopCountdown(TIMER_AUTO_STOP_S);
      void postTimerNotification(
        "Still working?",
        timerStillWorkingDescription(jobLabel),
        jobId ?? undefined,
      );
    }, TIMER_PING_INTERVAL_S * 1000);
  }, [jobLabel, jobId]);

  useEffect(() => {
    if (!running) {
      clearPingTimer();
      clearCountdown();
      deadlineMsRef.current = null;
      idleFiredRef.current = false;
      setShowActivityPing(false);
      setAutoStopCountdown(TIMER_AUTO_STOP_S);
      return;
    }
    if (!showActivityPing) schedulePing();
    return () => clearPingTimer();
  }, [running, showActivityPing, schedulePing]);

  const fireIdleOnce = useCallback(() => {
    if (idleFiredRef.current) return;
    idleFiredRef.current = true;
    setShowActivityPing(false);
    deadlineMsRef.current = null;
    void Promise.resolve(onIdleRef.current?.()).then(() => {
      void postTimerNotification(
        "Timer paused",
        `Your timer was paused for ${jobLabel} because the check-in was not answered. Tap Resume to keep tracking.`,
        jobId ?? undefined,
      );
    });
  }, [jobLabel, jobId]);

  useEffect(() => {
    if (!showActivityPing || !running) {
      clearCountdown();
      deadlineMsRef.current = null;
      return;
    }

    const armDeadlineIfVisible = () => {
      if (!isDocumentVisible()) {
        deadlineMsRef.current = null;
        setAutoStopCountdown(TIMER_AUTO_STOP_S);
        return;
      }
      deadlineMsRef.current = Date.now() + TIMER_AUTO_STOP_S * 1000;
      setAutoStopCountdown(TIMER_AUTO_STOP_S);
    };

    armDeadlineIfVisible();

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        armDeadlineIfVisible();
        return;
      }
      deadlineMsRef.current = null;
      setAutoStopCountdown(TIMER_AUTO_STOP_S);
    };

    countdownRef.current = window.setInterval(() => {
      if (!isDocumentVisible() || deadlineMsRef.current == null) {
        setAutoStopCountdown(TIMER_AUTO_STOP_S);
        return;
      }
      const left = remainingDeadlineSeconds(deadlineMsRef.current);
      setAutoStopCountdown(left);
      if (left <= 0) fireIdleOnce();
    }, 1000);

    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearCountdown();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [showActivityPing, running, fireIdleOnce]);

  const dismissPing = useCallback(() => {
    setShowActivityPing(false);
    setAutoStopCountdown(TIMER_AUTO_STOP_S);
    deadlineMsRef.current = null;
    idleFiredRef.current = false;
  }, []);

  return {
    showActivityPing,
    autoStopCountdown,
    dismissPing,
  };
}
