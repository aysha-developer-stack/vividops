export type AlertNotification = {
  id: string;
  jobId: string | null;
  type: string;
  title: string;
  desc: string;
  unread: boolean;
  createdAt: string;
};

export type NotificationAlertPrefs = {
  inAppEnabled: boolean;
  pushEnabled: boolean;
  soundEnabled: boolean;
  webPushActive: boolean;
};

export type NotificationAlertActions = {
  showToast: (item: AlertNotification) => void;
  showDesktop: (item: AlertNotification) => void;
  openTarget: (jobId: string | null, type: string) => void;
  playSound: () => void;
};

let prefs: NotificationAlertPrefs = {
  inAppEnabled: true,
  pushEnabled: true,
  soundEnabled: true,
  webPushActive: false,
};

let actions: NotificationAlertActions | null = null;

export function configureNotificationAlerts(
  nextPrefs: Partial<NotificationAlertPrefs>,
  nextActions: NotificationAlertActions,
): void {
  prefs = { ...prefs, ...nextPrefs };
  actions = nextActions;
}

export function setWebPushActive(active: boolean): void {
  prefs = { ...prefs, webPushActive: active };
}

export function isTabVisible(): boolean {
  if (typeof document === "undefined") return true;
  return document.visibilityState === "visible";
}

/** Deliver one or more new notifications — picks latest for display, plays sound once. */
export function deliverNotificationAlerts(
  items: AlertNotification[],
  opts?: { forceDesktop?: boolean; playSound?: boolean },
): void {
  if (!actions || items.length === 0) return;

  const latest = [...items].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )[0];

  const tabVisible = isTabVisible();
  const useInApp = tabVisible && prefs.inAppEnabled;
  const useDesktopFallback =
    !tabVisible &&
    prefs.pushEnabled &&
    !prefs.webPushActive &&
    (opts?.forceDesktop ?? true);

  if (useInApp) {
    actions.showToast(latest);
  } else if (useDesktopFallback) {
    actions.showDesktop(latest);
  }

  const delivered = useInApp || useDesktopFallback;
  if (delivered && opts?.playSound !== false && prefs.soundEnabled) {
    actions.playSound();
  }
}

export function deliverNotificationBatchSummary(count: number): void {
  if (!actions || count <= 0) return;
  if (isTabVisible()) return;
  if (!prefs.pushEnabled || prefs.webPushActive) return;

  actions.showDesktop({
    id: `batch-${Date.now()}`,
    jobId: null,
    type: "updated",
    title: "Vivid OPS",
    desc: `${count} new notification${count === 1 ? "" : "s"} while you were away`,
    unread: true,
    createdAt: new Date().toISOString(),
  });
}
