import { io, type Socket } from "socket.io-client";
import type { Notification } from "@workspace/api-client-react";

export type RealtimeNotification = Pick<
  Notification,
  "id" | "userId" | "title" | "description" | "type" | "isRead" | "createdAt"
> & { jobId?: string | null };

let socket: Socket | null = null;
let socketUserId: string | null = null;
let notificationHandler: ((notification: RealtimeNotification) => void) | null = null;
let realtimeAlertHandler: ((notification: RealtimeNotification) => void) | null = null;

export function setRealtimeNotificationAlertHandler(
  handler: ((notification: RealtimeNotification) => void) | null,
): void {
  realtimeAlertHandler = handler;
}

export function connectNotificationSocket(
  userId: string,
  onNotification: (notification: RealtimeNotification) => void,
): Socket | null {
  if (typeof window === "undefined") return null;

  notificationHandler = onNotification;

  if (socket?.connected && socketUserId === userId) {
    return socket;
  }

  disconnectNotificationSocket();

  socketUserId = userId;
  socket = io({
    path: "/socket.io",
    withCredentials: true,
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
  });

  socket.on("notification:new", (payload: RealtimeNotification) => {
    if (payload?.userId !== userId) return;
    notificationHandler?.(payload);
    realtimeAlertHandler?.(payload);
  });

  return socket;
}

export function disconnectNotificationSocket() {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
  }
  socket = null;
  socketUserId = null;
  notificationHandler = null;
  realtimeAlertHandler = null;
}
