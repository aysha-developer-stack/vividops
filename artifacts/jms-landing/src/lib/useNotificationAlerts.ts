import { useCallback, useEffect, useMemo, useRef } from "react";
import { useLocation } from "wouter";
import {
  getGetNotificationsQueryKey,
  getGetUserSettingsQueryKey,
  useGetNotifications,
  useGetUserSettings,
  type Notification,
  type User,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { playNotificationTone, sortNotificationsByPriority } from "@/lib/notifications";
import {
  ensureDesktopNotificationPermission,
  showDesktopNotificationBatch,
  shouldPreferInAppNotifications,
  shouldShowDesktopNotifications,
} from "@/lib/desktopNotifications";
import { getNotificationPath } from "@/lib/notificationNavigation";
import type { Role } from "@/lib/roles";

type ApiNotification = Notification & { jobId?: string | null };

type AlertNotification = {
  id: string;
  jobId: string | null;
  type: string;
  title: string;
  desc: string;
  unread: boolean;
  createdAt: string;
};

function pickToastCandidates(items: AlertNotification[]): AlertNotification[] {
  const messages = items.filter((n) => n.type === "job_message");
  const otherAlerts = items.filter(
    (n) => n.type !== "job_message" && n.type !== "progress" && n.type !== "timer",
  );
  const timerAlerts = items.filter((n) => n.type === "timer");
  return [
    ...messages.slice(0, 5),
    ...timerAlerts.slice(0, 2),
    ...otherAlerts.slice(0, 3),
  ];
}

/** Session-level notification alerts (toasts / desktop), independent of page navigation. */
export function useNotificationAlerts(user: User | null | undefined) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const userId = user?.id;
  const role = (user?.role as Role | undefined) ?? "user";

  const notificationsQueryKey = useMemo(
    () => [...getGetNotificationsQueryKey(), userId ?? "anonymous"],
    [userId],
  );

  const { data: userSettings } = useGetUserSettings({
    query: {
      queryKey: getGetUserSettingsQueryKey(),
      enabled: !!userId,
    },
  });

  const inAppEnabled = userSettings?.inAppNotifications !== false;
  const pushEnabled = userSettings?.pushNotifications !== false;
  const soundEnabled = userSettings?.soundEnabled !== false;
  const inAppEnabledRef = useRef(inAppEnabled);
  const pushEnabledRef = useRef(pushEnabled);
  const soundEnabledRef = useRef(soundEnabled);
  inAppEnabledRef.current = inAppEnabled;
  pushEnabledRef.current = pushEnabled;
  soundEnabledRef.current = soundEnabled;

  const seenNotificationIdsRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);

  const { data: apiNotifications } = useGetNotifications({
    query: {
      queryKey: notificationsQueryKey,
      enabled: !!userId,
      staleTime: 0,
      refetchOnMount: true,
      refetchOnWindowFocus: true,
      refetchInterval: 60000,
      refetchIntervalInBackground: true,
    },
  });

  useEffect(() => {
    if (!userId || !pushEnabled) return;
    void ensureDesktopNotificationPermission();
  }, [userId, pushEnabled]);

  useEffect(() => {
    initializedRef.current = false;
    seenNotificationIdsRef.current = new Set();
  }, [userId]);

  const openNotificationTarget = useCallback((jobId?: string | null, type?: string) => {
    if (jobId) {
      setLocation(getNotificationPath(role, { type: type ?? "updated", jobId }));
      return;
    }
    setLocation(getNotificationPath(role, { type: "updated" }));
  }, [role, setLocation]);

  const showDesktopForNotifications = useCallback(async (items: AlertNotification[]) => {
    if (!pushEnabledRef.current || items.length === 0) return;
    if (typeof Notification === "undefined") return;

    let permission: NotificationPermission | "unsupported" = Notification.permission;
    if (permission === "default") {
      permission = await ensureDesktopNotificationPermission();
    }
    if (permission !== "granted") return;

    showDesktopNotificationBatch(
      items.map((n) => ({
        id: String(n.id),
        title: n.title,
        body: n.desc,
      })),
      {
        onOpen: (id) => {
          if (id === "inbox") {
            openNotificationTarget(null);
            return;
          }
          const item = items.find((n) => String(n.id) === id);
          openNotificationTarget(item?.jobId, item?.type);
        },
      },
    );
  }, [openNotificationTarget]);

  const showInAppForNotifications = useCallback((items: AlertNotification[]) => {
    if (!inAppEnabledRef.current || items.length === 0) return;

    const candidates = pickToastCandidates(items);
    if (candidates.length === 0) return;

    candidates.forEach((n, index) => {
      window.setTimeout(() => {
        toast({
          title: n.title,
          description: n.desc,
          variant: n.type === "overdue" ? "destructive" : "default",
        });
      }, index * 350);
    });

    const remaining = items.length - candidates.length;
    if (remaining > 0) {
      window.setTimeout(() => {
        toast({
          title: `${remaining} more notification${remaining === 1 ? "" : "s"}`,
          description: "Open the bell icon to view everything in your inbox.",
        });
      }, candidates.length * 350 + 100);
    }
  }, [toast]);

  const deliverAlerts = useCallback((
    items: AlertNotification[],
    opts?: { playSound?: boolean },
  ) => {
    if (items.length === 0) return;

    const useInApp = shouldPreferInAppNotifications();
    const useDesktop = pushEnabledRef.current && shouldShowDesktopNotifications();

    if (useInApp) {
      showInAppForNotifications(items);
    } else if (useDesktop) {
      void showDesktopForNotifications(items);
    }

    if (opts?.playSound !== false && soundEnabledRef.current && (useInApp || useDesktop)) {
      void playNotificationTone();
    }
  }, [showDesktopForNotifications, showInAppForNotifications]);

  const notifications = useMemo(() => {
    return sortNotificationsByPriority(
      (apiNotifications ?? []).map((n) => {
        const row = n as ApiNotification;
        return {
          id: n.id,
          jobId: row.jobId ?? null,
          type: n.type,
          title: n.title,
          desc: n.description,
          unread: !n.isRead,
          createdAt: n.createdAt,
        };
      }),
    );
  }, [apiNotifications]);

  useEffect(() => {
    if (!userId) return;

    const storageKey = `seen-notifications:${userId}`;
    const currentIds = notifications.map((n) => String(n.id));

    if (!initializedRef.current) {
      const storedIds = new Set<string>();
      try {
        const raw = window.sessionStorage.getItem(storageKey);
        const stored = raw ? JSON.parse(raw) : [];
        if (Array.isArray(stored)) {
          for (const id of stored) storedIds.add(String(id));
        }
      } catch {
      }

      const missedUnread = notifications.filter(
        (n) => n.unread && !storedIds.has(String(n.id)),
      );

      seenNotificationIdsRef.current = new Set([...storedIds, ...currentIds]);
      initializedRef.current = true;

      try {
        window.sessionStorage.setItem(
          storageKey,
          JSON.stringify(Array.from(seenNotificationIdsRef.current)),
        );
      } catch {
      }

      if (missedUnread.length > 0) {
        deliverAlerts(missedUnread);
      }
      return;
    }

    const newNotifications = notifications.filter(
      (n) => n.unread && !seenNotificationIdsRef.current.has(String(n.id)),
    );
    if (newNotifications.length === 0) return;

    for (const notification of newNotifications) {
      seenNotificationIdsRef.current.add(String(notification.id));
    }

    try {
      window.sessionStorage.setItem(
        storageKey,
        JSON.stringify(Array.from(seenNotificationIdsRef.current)),
      );
    } catch {
    }

    deliverAlerts(newNotifications);
  }, [deliverAlerts, notifications, userId]);
}
