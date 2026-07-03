import { useCallback, useEffect, useRef, useState } from "react";
import {
  postTimerNotification,
  TIMER_AUTO_STOP_S,
  TIMER_PING_INTERVAL_S,
} from "@/lib/timerNotifications";

export function useTimerActivityPing({
  running,
  elapsedSeconds,
  jobLabel,
  jobId,
  onAutoStop,
}: {
  running: boolean;
  elapsedSeconds: number;
  jobLabel: string;
  jobId?: string | null;
  onAutoStop: () => void | Promise<void>;
}) {
  const [showActivityPing, setShowActivityPing] = useState(false);
  const [autoStopCountdown, setAutoStopCountdown] = useState(TIMER_AUTO_STOP_S);
  const pingTimerRef = useRef<number | null>(null);
  const autoStopRef = useRef<number | null>(null);

  useEffect(() => {
    if (!running) {
      if (pingTimerRef.current) clearTimeout(pingTimerRef.current);
      return;
    }

    const segment = Math.floor(elapsedSeconds / TIMER_PING_INTERVAL_S);
    const msUntilNextPing = Math.max(
      1000,
      (segment + 1) * TIMER_PING_INTERVAL_S * 1000 - elapsedSeconds * 1000,
    );

    pingTimerRef.current = window.setTimeout(() => {
      setShowActivityPing(true);
      setAutoStopCountdown(TIMER_AUTO_STOP_S);
      void postTimerNotification(
        "Still working?",
        `Your timer on ${jobLabel} has been running for 1 hour. Continue or stop within 5 minutes.`,
        jobId ?? undefined,
      );
    }, msUntilNextPing);

    return () => {
      if (pingTimerRef.current) clearTimeout(pingTimerRef.current);
    };
  }, [running, Math.floor(elapsedSeconds / TIMER_PING_INTERVAL_S), jobLabel, jobId]);

  useEffect(() => {
    if (!showActivityPing) {
      if (autoStopRef.current) clearInterval(autoStopRef.current);
      return;
    }

    autoStopRef.current = window.setInterval(() => {
      setAutoStopCountdown((current) => {
        if (current <= 1) {
          setShowActivityPing(false);
          void Promise.resolve(onAutoStop()).then(() => {
            void postTimerNotification(
              "Timer auto-stopped",
              `Your timer was stopped automatically for ${jobLabel} (no response).`,
              jobId ?? undefined,
            );
          });
          return 0;
        }
        return current - 1;
      });
    }, 1000);

    return () => {
      if (autoStopRef.current) clearInterval(autoStopRef.current);
    };
  }, [showActivityPing, jobLabel, jobId, onAutoStop]);

  const dismissPing = useCallback(() => {
    setShowActivityPing(false);
    setAutoStopCountdown(TIMER_AUTO_STOP_S);
  }, []);

  return {
    showActivityPing,
    autoStopCountdown,
    dismissPing,
  };
}
