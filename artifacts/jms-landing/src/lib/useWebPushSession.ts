import { useEffect, useRef } from "react";
import {
  isWebPushActive,
  refreshWebPushRegistration,
  registerWebPush,
  unregisterWebPush,
  webPushSupported,
} from "@/lib/webPush";
import { setWebPushActive } from "@/lib/notificationAlertDelivery";

/** Keep Web Push subscription in sync with user push preference (Level 2). */
export function useWebPushSession(
  userId: string | undefined,
  pushEnabled: boolean | undefined,
) {
  const pushEnabledRef = useRef(pushEnabled !== false);
  pushEnabledRef.current = pushEnabled !== false;

  useEffect(() => {
    if (!userId || !webPushSupported()) {
      setWebPushActive(false);
      return;
    }

    let cancelled = false;

    const sync = async () => {
      if (cancelled) return;

      if (!pushEnabledRef.current) {
        await unregisterWebPush();
        setWebPushActive(false);
        return;
      }

      const ok =
        (await refreshWebPushRegistration()) ||
        (await registerWebPush());

      if (cancelled) return;

      setWebPushActive(ok && isWebPushActive());
    };

    void sync();

    return () => {
      cancelled = true;
    };
  }, [userId, pushEnabled]);
}
