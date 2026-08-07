import { io, type Socket } from "socket.io-client";
import type { Notification } from "@workspace/api-client-react";

export type RealtimeNotification = Pick<
  Notification,
  "id" | "userId" | "title" | "description" | "type" | "isRead" | "createdAt"
> & { jobId?: string | null };

let socket: Socket | null = null;
let socketUserId: string | null = null;

export function connectNotificationSocket(
  userId: string,
  onNotification: (notification: RealtimeNotification) => void,
): Socket | null {
  if (typeof window === "undefined") return null;

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
    onNotification(payload);
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
}
