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
import {
  getNotificationToastVariant,
  playNotificationTone,
  sortNotificationsByPriority,
} from "@/lib/notifications";
import {
  ensureDesktopNotificationPermission,
  showDesktopNotification,
} from "@/lib/desktopNotifications";
import {
  configureNotificationAlerts,
  deliverNotificationAlerts,
  type AlertNotification,
} from "@/lib/notificationAlertDelivery";
import { getNotificationPath } from "@/lib/notificationNavigation";
import {
  setRealtimeNotificationAlertHandler,
  type RealtimeNotification,
} from "@/lib/notificationSocket";
import type { Role } from "@/lib/roles";

type ApiNotification = Notification & { jobId?: string | null };

function toAlertNotification(row: {
  id: string | number;
  jobId?: string | null;
  type: string;
  title: string;
  description?: string;
  desc?: string;
  isRead?: boolean;
  unread?: boolean;
  createdAt: string;
}): AlertNotification {
  return {
    id: String(row.id),
    jobId: row.jobId ?? null,
    type: row.type,
    title: row.title,
    desc: row.desc ?? row.description ?? "",
    unread: row.unread ?? !row.isRead,
    createdAt: row.createdAt,
  };
}

/** Session-level notification alerts (toasts / desktop / socket), independent of page navigation. */
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

  const seenNotificationIdsRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);
  const roleRef = useRef(role);
  roleRef.current = role;

  const openNotificationTarget = useCallback((jobId?: string | null, type?: string) => {
    if (jobId) {
      setLocation(getNotificationPath(roleRef.current, { type: type ?? "updated", jobId }));
      return;
    }
    setLocation(getNotificationPath(roleRef.current, { type: "updated" }));
  }, [setLocation]);

  const showNotificationToast = useCallback((item: AlertNotification) => {
    toast({
      title: item.title,
      description: item.desc,
      variant: getNotificationToastVariant(item.type),
      duration: 5000,
    });
  }, [toast]);

  const showDesktopForNotification = useCallback((item: AlertNotification) => {
    showDesktopNotification(
      { id: String(item.id), title: item.title, body: item.desc },
      () => openNotificationTarget(item.jobId, item.type),
    );
  }, [openNotificationTarget]);

  const playSound = useCallback(() => {
    void playNotificationTone();
  }, []);

  useEffect(() => {
    configureNotificationAlerts(
      { inAppEnabled, pushEnabled, soundEnabled },
      {
        showToast: showNotificationToast,
        showDesktop: showDesktopForNotification,
        openTarget: openNotificationTarget,
        playSound,
      },
    );
  }, [
    inAppEnabled,
    pushEnabled,
    soundEnabled,
    showNotificationToast,
    showDesktopForNotification,
    openNotificationTarget,
    playSound,
  ]);

  useEffect(() => {
    if (!userId || !pushEnabled) return;
    void ensureDesktopNotificationPermission();
  }, [userId, pushEnabled]);

  useEffect(() => {
    initializedRef.current = false;
    seenNotificationIdsRef.current = new Set();
  }, [userId]);

  const markSeen = useCallback((ids: string[]) => {
    for (const id of ids) {
      seenNotificationIdsRef.current.add(id);
    }
    if (!userId) return;
    try {
      window.sessionStorage.setItem(
        `seen-notifications:${userId}`,
        JSON.stringify(Array.from(seenNotificationIdsRef.current)),
      );
    } catch {
    }
  }, [userId]);

  const processNewNotifications = useCallback((
    items: AlertNotification[],
    opts?: { forceDesktop?: boolean },
  ) => {
    const fresh = items.filter(
      (n) => n.unread && !seenNotificationIdsRef.current.has(String(n.id)),
    );
    if (fresh.length === 0) return;

    markSeen(fresh.map((n) => String(n.id)));
    deliverNotificationAlerts(fresh, { forceDesktop: opts?.forceDesktop });
  }, [markSeen]);

  const handleRealtimeNotification = useCallback((incoming: RealtimeNotification) => {
    if (!userId || incoming.userId !== userId) return;

    const item = toAlertNotification({
      id: incoming.id,
      jobId: incoming.jobId,
      type: incoming.type,
      title: incoming.title,
      description: incoming.description,
      isRead: incoming.isRead,
      createdAt: incoming.createdAt,
    });

    if (!initializedRef.current) return;
    processNewNotifications([item], { forceDesktop: true });
  }, [processNewNotifications, userId]);

  useEffect(() => {
    setRealtimeNotificationAlertHandler(handleRealtimeNotification);
    return () => setRealtimeNotificationAlertHandler(null);
  }, [handleRealtimeNotification]);

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

  const notifications = useMemo(() => {
    return sortNotificationsByPriority(
      (apiNotifications ?? []).map((n) => {
        const row = n as ApiNotification;
        return toAlertNotification({
          id: n.id,
          jobId: row.jobId ?? null,
          type: n.type,
          title: n.title,
          description: n.description,
          isRead: n.isRead,
          createdAt: n.createdAt,
        });
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

      seenNotificationIdsRef.current = new Set([...storedIds, ...currentIds]);
      initializedRef.current = true;

      try {
        window.sessionStorage.setItem(
          storageKey,
          JSON.stringify(Array.from(seenNotificationIdsRef.current)),
        );
      } catch {
      }

      return;
    }

    processNewNotifications(notifications);
  }, [notifications, processNewNotifications, userId]);

  useEffect(() => {
    if (!userId) return;

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      processNewNotifications(notifications);
    };

    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [notifications, processNewNotifications, userId]);
}
