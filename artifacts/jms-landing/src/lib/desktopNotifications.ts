export type DesktopNotificationPayload = {
  id: string;
  title: string;
  body: string;
};

export function desktopNotificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

/** User is actively viewing this app tab — prefer in-app toasts, not OS popups. */
export function shouldPreferInAppNotifications(): boolean {
  if (typeof document === "undefined") return true;
  return document.visibilityState === "visible" && document.hasFocus();
}

export function shouldShowDesktopNotifications(): boolean {
  return !shouldPreferInAppNotifications();
}

export async function ensureDesktopNotificationPermission(): Promise<
  NotificationPermission | "unsupported"
> {
  if (!desktopNotificationsSupported()) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}

export function showDesktopNotification(
  payload: DesktopNotificationPayload,
  onOpen?: () => void,
): void {
  if (!desktopNotificationsSupported()) return;
  if (Notification.permission !== "granted") return;

  try {
    const notification = new Notification(payload.title, {
      body: payload.body,
      tag: `vividops-${payload.id}`,
      icon: "/favicon.svg",
    });

    notification.onclick = () => {
      window.focus();
      notification.close();
      onOpen?.();
    };
  } catch {
    // Browser blocked or unsupported context.
  }
}

export function showDesktopNotificationBatch(
  items: DesktopNotificationPayload[],
  opts?: { maxIndividual?: number; onOpen?: (id: string) => void },
): void {
  const maxIndividual = opts?.maxIndividual ?? 5;
  const slice = items.slice(0, maxIndividual);

  for (const item of slice) {
    showDesktopNotification(item, () => opts?.onOpen?.(item.id));
  }

  const remaining = items.length - slice.length;
  if (remaining > 0) {
    showDesktopNotification(
      {
        id: `more-${Date.now()}`,
        title: "Vivid OPS",
        body: `${remaining} more notification${remaining === 1 ? "" : "s"} — open the app to view all.`,
      },
      () => opts?.onOpen?.("inbox"),
    );
  }
}
