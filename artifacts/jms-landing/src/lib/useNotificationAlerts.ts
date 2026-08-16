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
  pickLatestNotification,
  playNotificationTone,
  sortNotificationsByPriority,
} from "@/lib/notifications";
import {
  ensureDesktopNotificationPermission,
  showDesktopNotification,
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

  const showNotificationToast = useCallback((item: AlertNotification) => {
    if (!inAppEnabledRef.current) return;
    toast({
      title: item.title,
      description: item.desc,
      variant: getNotificationToastVariant(item.type),
      duration: 5000,
    });
  }, [toast]);

  const showDesktopForNotification = useCallback((item: AlertNotification) => {
    if (!pushEnabledRef.current) return;
    if (typeof Notification === "undefined") return;
    if (Notification.permission !== "granted") return;

    showDesktopNotification(
      { id: String(item.id), title: item.title, body: item.desc },
      () => openNotificationTarget(item.jobId, item.type),
    );
  }, [openNotificationTarget]);

  const deliverNewNotificationToast = useCallback((
    items: AlertNotification[],
    opts?: { playSound?: boolean },
  ) => {
    const latest = pickLatestNotification(items);
    if (!latest) return;

    const useInApp = shouldPreferInAppNotifications();
    const useDesktop = pushEnabledRef.current && shouldShowDesktopNotifications();

    if (useInApp) {
      showNotificationToast(latest);
    } else if (useDesktop) {
      showDesktopForNotification(latest);
    }

    if (opts?.playSound !== false && soundEnabledRef.current && (useInApp || useDesktop)) {
      void playNotificationTone();
    }
  }, [showDesktopForNotification, showNotificationToast]);

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

      seenNotificationIdsRef.current = new Set([...storedIds, ...currentIds]);
      initializedRef.current = true;

      try {
        window.sessionStorage.setItem(
          storageKey,
          JSON.stringify(Array.from(seenNotificationIdsRef.current)),
        );
      } catch {
      }

      // On login: mark existing inbox items as seen — no toast for old unread.
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

    deliverNewNotificationToast(newNotifications);
  }, [deliverNewNotificationToast, notifications, userId]);
}
