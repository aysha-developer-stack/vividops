export type PresenceStatus = "online" | "away" | "offline";

const ONLINE_MS = 5 * 60 * 1000;
const AWAY_MS = 24 * 60 * 60 * 1000;

function parseMs(value: string | Date | null | undefined): number | null {
  if (!value) return null;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/** Live presence from lastSeenAt heartbeat (falls back to lastSignInAt). */
export function getPresenceStatus(opts: {
  accountStatus?: string | null;
  lastSeenAt?: string | Date | null;
  lastSignInAt?: string | Date | null;
  now?: number;
}): PresenceStatus {
  if (opts.accountStatus && opts.accountStatus !== "active") return "offline";

  const lastSeenMs = parseMs(opts.lastSeenAt);
  const lastSignInMs = parseMs(opts.lastSignInAt);
  const now = opts.now ?? Date.now();

  // Online only when a recent heartbeat (or a brand-new login) exists.
  if (lastSeenMs != null && now - lastSeenMs <= ONLINE_MS) return "online";
  if (lastSeenMs == null && lastSignInMs != null && now - lastSignInMs <= ONLINE_MS) {
    return "online";
  }

  const recentMs = Math.max(lastSeenMs ?? 0, lastSignInMs ?? 0);
  if (recentMs > 0 && now - recentMs <= AWAY_MS) return "away";
  return "offline";
}

export function formatPresenceLabel(status: PresenceStatus): string {
  if (status === "online") return "Online";
  if (status === "away") return "Away";
  return "Offline";
}
