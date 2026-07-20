import { eq } from "drizzle-orm";
import { db, users } from "@workspace/db";

const ONLINE_MS = 5 * 60 * 1000;
const AWAY_MS = 24 * 60 * 60 * 1000;
const TOUCH_INTERVAL_MS = 60_000;

const lastTouchByUser = new Map<string, number>();

export type PresenceStatus = "online" | "away" | "offline";

export function getPresenceStatus(opts: {
  accountStatus?: string | null;
  lastSeenAt?: Date | null;
  lastSignInAt?: Date | null;
  now?: number;
}): PresenceStatus {
  if (opts.accountStatus && opts.accountStatus !== "active") return "offline";

  const lastSeenMs = opts.lastSeenAt?.getTime() ?? null;
  const lastSignInMs = opts.lastSignInAt?.getTime() ?? null;
  const now = opts.now ?? Date.now();

  if (lastSeenMs != null && now - lastSeenMs <= ONLINE_MS) return "online";
  if (lastSeenMs == null && lastSignInMs != null && now - lastSignInMs <= ONLINE_MS) {
    return "online";
  }

  const recentMs = Math.max(lastSeenMs ?? 0, lastSignInMs ?? 0);
  if (recentMs > 0 && now - recentMs <= AWAY_MS) return "away";
  return "offline";
}

/** Throttled heartbeat so open sessions stay marked online. */
export function touchUserLastSeen(userId: string): void {
  const now = Date.now();
  const prev = lastTouchByUser.get(userId) ?? 0;
  if (now - prev < TOUCH_INTERVAL_MS) return;
  lastTouchByUser.set(userId, now);
  void db
    .update(users)
    .set({ lastSeenAt: new Date(), updatedAt: new Date() })
    .where(eq(users.id, userId))
    .catch(() => {
      lastTouchByUser.delete(userId);
    });
}
