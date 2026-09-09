export type SidebarBadgeSection = "training" | "jobs" | "communication" | "mistakes";

export type SidebarBadgeCounts = {
  training: number;
  jobs: number;
  communication: number;
  mistakes: number;
};

export const EMPTY_SIDEBAR_BADGES: SidebarBadgeCounts = {
  training: 0,
  jobs: 0,
  communication: 0,
  mistakes: 0,
};

export const SIDEBAR_BADGES_REFRESH_EVENT = "sidebar-badges:refresh";

export function refreshSidebarBadges() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(SIDEBAR_BADGES_REFRESH_EVENT));
}

export function badgeSectionFromPath(path: string): SidebarBadgeSection | null {
  if (/\/training(?:\/|$)/.test(path)) return "training";
  if (/\/communication(?:\/|$)/.test(path)) return "communication";
  if (/\/mistakes(?:\/|$)/.test(path)) return "mistakes";
  if (/\/jobs(?:\/|$)/.test(path)) return "jobs";
  return null;
}

async function parseCounts(res: Response): Promise<SidebarBadgeCounts> {
  if (!res.ok) return EMPTY_SIDEBAR_BADGES;
  try {
    const data = (await res.json()) as Partial<SidebarBadgeCounts>;
    return {
      training: Math.max(0, Number(data.training) || 0),
      jobs: Math.max(0, Number(data.jobs) || 0),
      communication: Math.max(0, Number(data.communication) || 0),
      mistakes: Math.max(0, Number(data.mistakes) || 0),
    };
  } catch {
    return EMPTY_SIDEBAR_BADGES;
  }
}

export async function fetchSidebarBadgeCounts(): Promise<SidebarBadgeCounts> {
  const res = await fetch("/api/sidebar-badge-counts", { credentials: "include" });
  return parseCounts(res);
}

export async function markSidebarSectionSeen(section: SidebarBadgeSection): Promise<SidebarBadgeCounts> {
  if (section === "communication") return fetchSidebarBadgeCounts();
  const res = await fetch(`/api/sidebar-badge-counts/${section}/mark-seen`, {
    method: "POST",
    credentials: "include",
  });
  return parseCounts(res);
}

export function formatBadgeCount(count: number): string {
  if (count > 99) return "99+";
  return String(Math.max(0, Math.floor(count)));
}
