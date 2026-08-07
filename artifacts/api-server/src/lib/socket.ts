import { Server as SocketIOServer } from "socket.io";
import type { Server as HTTPServer } from "http";
import { logger } from "./logger";
import { loadSessionContext } from "../middlewares/session";

export let io: SocketIOServer;

export type RealtimeNotificationPayload = {
  id: string;
  userId: string;
  jobId?: string | null;
  title: string;
  description: string;
  type: string;
  isRead: boolean;
  createdAt: string;
};

export function userRoom(userId: string): string {
  return `user:${userId}`;
}

export function emitToUser(userId: string, event: string, payload: unknown) {
  if (!io) return;
  io.to(userRoom(userId)).emit(event, payload);
}

export function pushNotificationRealtime(payload: RealtimeNotificationPayload) {
  emitToUser(payload.userId, "notification:new", payload);
}

export function setupSocketIO(server: HTTPServer) {
  io = new SocketIOServer(server, {
    cors: {
      origin: true,
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    try {
      const cookieHeader = socket.handshake.headers.cookie;
      const session = await loadSessionContext(cookieHeader ?? "", { fromCookieHeader: true });
      if (!session) {
        next(new Error("Unauthorized"));
        return;
      }
      socket.data.userId = session.user.id;
      socket.data.userRole = session.user.role;
      next();
    } catch (err) {
      logger.warn({ err }, "Socket authentication failed");
      next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.data.userId as string | undefined;
    if (userId) {
      socket.join(userRoom(userId));
    }

    logger.info({ socketId: socket.id, userId }, "Notification socket connected");

    socket.on("job:join", (jobId: unknown) => {
      if (typeof jobId === "string" && jobId.trim()) {
        socket.join(`job:${jobId}`);
      }
    });

    socket.on("job:leave", (jobId: unknown) => {
      if (typeof jobId === "string" && jobId.trim()) {
        socket.leave(`job:${jobId}`);
      }
    });

    socket.on("disconnect", () => {
      logger.info({ socketId: socket.id, userId }, "Notification socket disconnected");
    });
  });

  return io;
}
