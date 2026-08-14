import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetNotificationsQueryKey,
  type Notification,
} from "@workspace/api-client-react";
import {
  connectNotificationSocket,
  disconnectNotificationSocket,
} from "@/lib/notificationSocket";

/** Keep one notification socket per logged-in session (survives page navigation). */
export function useNotificationSocketSession(userId: string | undefined) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!userId) {
      disconnectNotificationSocket();
      return;
    }

    const notificationsQueryKey = [...getGetNotificationsQueryKey(), userId];

    connectNotificationSocket(userId, (incoming) => {
      qc.setQueryData(notificationsQueryKey, (prev: Notification[] | undefined) => {
        if (!prev) return [incoming];
        if (prev.some((n) => n.id === incoming.id)) return prev;
        return [incoming, ...prev];
      });
    });

    return () => {
      disconnectNotificationSocket();
    };
  }, [userId, qc]);
}
