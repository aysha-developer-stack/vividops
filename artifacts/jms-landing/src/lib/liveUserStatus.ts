import { getPresenceStatus } from "@/lib/presence";

export type LiveUserStatus = "working" | "online" | "away" | "offline" | "inactive";

export function resolveLiveUserStatus(opts: {
  accountStatus?: string | null;
  lastSeenAt?: string | Date | null;
  lastSignInAt?: string | Date | null;
  activeTimerIsLive?: boolean;
  now?: number;
}): LiveUserStatus {
  if (opts.accountStatus && opts.accountStatus !== "active") return "inactive";
  if (opts.activeTimerIsLive) return "working";

  const presence = getPresenceStatus({
    accountStatus: opts.accountStatus,
    lastSeenAt: opts.lastSeenAt,
    lastSignInAt: opts.lastSignInAt,
    now: opts.now,
  });
  if (presence === "online") return "online";
  if (presence === "away") return "away";
  return "offline";
}

export function formatLiveStatusLabel(status: LiveUserStatus): string {
  if (status === "working") return "Working";
  if (status === "online") return "Online";
  if (status === "away") return "Away";
  if (status === "inactive") return "Inactive";
  return "Offline";
}

export function liveStatusDotClass(status: LiveUserStatus, opts?: { pulse?: boolean }): string {
  const pulse = opts?.pulse !== false;
  if (status === "working") return pulse ? "bg-sky-400 animate-pulse" : "bg-sky-400";
  if (status === "online") return "bg-emerald-400";
  if (status === "away") return "bg-amber-400";
  if (status === "inactive") return "bg-gray-300";
  return "bg-gray-400";
}

export function liveStatusTextClass(status: LiveUserStatus): string {
  if (status === "working") return "text-sky-700";
  if (status === "online") return "text-emerald-700";
  if (status === "away") return "text-amber-700";
  if (status === "inactive") return "text-gray-500";
  return "text-gray-500";
}
