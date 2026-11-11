import { useCallback, useEffect, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetNotificationsQueryKey,
  useGetNotifications,
  type Notification,
} from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { jobTabsForNotification, type JobDetailTabId } from "@/lib/notificationNavigation";
import { refreshSidebarBadges } from "@/lib/sidebarBadgesApi";

type JobNotification = Notification & { jobId?: string | null };

function unreadIdsForTab(rows: JobNotification[] | undefined, jobId: string, tab: string): string[] {
  if (!rows) return [];
  return rows
    .filter((n) => {
      if (n.isRead) return false;
      if (n.jobId !== jobId) return false;
      return jobTabsForNotification({
        type: n.type,
        jobId: n.jobId,
        title: n.title,
        description: n.description,
      }).includes(tab as JobDetailTabId);
    })
    .map((n) => n.id);
}

export function useJobTabUnread(jobId: string | undefined, activeTab: JobDetailTabId | string) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const notificationsQueryKey = useMemo(
    () => [...getGetNotificationsQueryKey(), user?.id ?? "anonymous"],
    [user?.id],
  );
  const { data } = useGetNotifications({
    query: {
      queryKey: notificationsQueryKey,
      staleTime: 10_000,
      refetchOnWindowFocus: true,
      refetchInterval: 60_000,
    },
  });

  const unreadTabs = useMemo(() => {
    const tabs = new Set<JobDetailTabId>();
    if (!jobId || !data) return tabs;
    for (const n of data as JobNotification[]) {
      if (n.isRead || n.jobId !== jobId) continue;
      const mapped = jobTabsForNotification({
        type: n.type,
        jobId: n.jobId,
        title: n.title,
        description: n.description,
      });
      for (const tab of mapped) {
        if (tab !== activeTab) tabs.add(tab);
      }
    }
    return tabs;
  }, [data, jobId, activeTab]);

  const dataRef = useRef(data);
  dataRef.current = data;
  const keyRef = useRef(notificationsQueryKey);
  keyRef.current = notificationsQueryKey;

  const markTabRead = useCallback(async (tab: string) => {
    if (!jobId) return;
    const ids = unreadIdsForTab(dataRef.current as JobNotification[] | undefined, jobId, tab);
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    qc.setQueryData(keyRef.current, (prev: JobNotification[] | undefined) => {
      if (!prev) return prev;
      return prev.map((n) => (idSet.has(n.id) ? { ...n, isRead: true } : n));
    });
    try {
      const res = await fetch("/api/notifications/read", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) throw new Error("Failed to mark tab notifications read");
      refreshSidebarBadges();
    } catch {
      void qc.invalidateQueries({ queryKey: keyRef.current });
    }
  }, [jobId, qc]);

  useEffect(() => {
    if (!jobId || !activeTab) return;
    void markTabRead(activeTab);
  }, [jobId, activeTab, data, markTabRead]);

  return unreadTabs;
}
