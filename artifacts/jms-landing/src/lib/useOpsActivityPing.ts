import { useEffect } from "react";

const PING_MS = 60_000;

/** Tell the server the worker clicked or typed in OPS (not lock, not polling). */
export function useOpsActivityPing(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;

    let lastSent = 0;
    const ping = () => {
      const now = Date.now();
      if (now - lastSent < PING_MS) return;
      lastSent = now;
      void fetch("/api/presence/activity", { method: "POST", credentials: "include" }).catch(() => {
        lastSent = 0;
      });
    };

    window.addEventListener("pointerdown", ping, true);
    window.addEventListener("keydown", ping, true);
    return () => {
      window.removeEventListener("pointerdown", ping, true);
      window.removeEventListener("keydown", ping, true);
    };
  }, [enabled]);
}
