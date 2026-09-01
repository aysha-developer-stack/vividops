export type JobListSortMode = "recent" | "recentlyUpdated" | "jobNumber";

export type JobSortFields = {
  number: string;
  status: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  lastMessageAt?: string | null;
  unreadCount?: number;
  reviewStartedAt?: string | null;
};

const UI_STATUS_PRIORITY: Record<string, number> = {
  Rework: 0,
  "In Progress": 1,
  "Not Started": 2,
  Overdue: 3,
  "Awaiting Supervisor": 4,
  "Awaiting Admin": 5,
  "Awaiting Super Admin": 5,
  "On Hold": 6,
  Done: 7,
  Cancelled: 8,
};

const API_STATUS_PRIORITY: Record<string, number> = {
  rework: 0,
  in_progress: 1,
  pending: 2,
  awaiting_supervisor: 4,
  awaiting_admin: 5,
  awaiting_super_admin: 5,
  on_hold: 6,
  completed: 7,
  cancelled: 8,
};

export const JOB_LIST_SORT_LABELS: Record<JobListSortMode, string> = {
  recent: "Recently",
  recentlyUpdated: "Recently updated",
  jobNumber: "Job number",
};

export const JOB_LIST_SORT_HINTS: Record<JobListSortMode, string> = {
  recent: "Newest created jobs first",
  recentlyUpdated: "Latest job activity first (edits, files, messages)",
  jobNumber: "Sort by job number (highest first)",
};

export const JOB_LIST_SORT_STORAGE_KEY = "jms_job_list_sort_v1";

export function readStoredJobListSort(): JobListSortMode {
  try {
    const raw = localStorage.getItem(JOB_LIST_SORT_STORAGE_KEY);
    if (raw === "recent" || raw === "jobNumber" || raw === "recentlyUpdated") return raw;
    // Previous default was "activity" — treat as recently created.
    if (raw === "activity") return "recent";
  } catch {
    // ignore
  }
  return "recent";
}

export function storeJobListSort(mode: JobListSortMode): void {
  try {
    localStorage.setItem(JOB_LIST_SORT_STORAGE_KEY, mode);
  } catch {
    // ignore
  }
}

/** Numeric key for JOB-154773-style labels; non-numeric values sort last. */
export function parseJobNumberSortKey(number: string): number {
  const digits = number.replace(/^JOB-/i, "").replace(/\D/g, "");
  if (digits) {
    const n = Number.parseInt(digits, 10);
    if (Number.isFinite(n)) return n;
  }
  return Number.MAX_SAFE_INTEGER;
}

function activityPriority(status: string): number {
  return UI_STATUS_PRIORITY[status] ?? API_STATUS_PRIORITY[status] ?? 6;
}

function compareStatusPriority(a: JobSortFields, b: JobSortFields): number {
  return activityPriority(a.status) - activityPriority(b.status);
}

function timestampMs(iso: string | null | undefined): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

/** Latest touch: message, edit, review start, or creation. */
function latestActivityMs(fields: JobSortFields): number {
  return Math.max(
    timestampMs(fields.lastMessageAt),
    timestampMs(fields.updatedAt),
    timestampMs(fields.reviewStartedAt),
    timestampMs(fields.createdAt),
  );
}

export function compareJobsByRecentlyUpdated(a: JobSortFields, b: JobSortFields): number {
  const statusDiff = compareStatusPriority(a, b);
  if (statusDiff !== 0) return statusDiff;
  const activityDiff = latestActivityMs(b) - latestActivityMs(a);
  if (activityDiff !== 0) return activityDiff;
  const numDiff = parseJobNumberSortKey(b.number) - parseJobNumberSortKey(a.number);
  if (numDiff !== 0) return numDiff;
  return b.number.localeCompare(a.number);
}

export function compareJobsByRecent(a: JobSortFields, b: JobSortFields): number {
  const statusDiff = compareStatusPriority(a, b);
  if (statusDiff !== 0) return statusDiff;
  const createdDiff = timestampMs(b.createdAt) - timestampMs(a.createdAt);
  if (createdDiff !== 0) return createdDiff;
  const numDiff = parseJobNumberSortKey(b.number) - parseJobNumberSortKey(a.number);
  if (numDiff !== 0) return numDiff;
  return b.number.localeCompare(a.number);
}

export function compareJobsByActivity(a: JobSortFields, b: JobSortFields): number {
  const unreadA = a.unreadCount ?? 0;
  const unreadB = b.unreadCount ?? 0;
  if (unreadA > 0 && unreadB === 0) return -1;
  if (unreadB > 0 && unreadA === 0) return 1;
  if (unreadA !== unreadB) return unreadB - unreadA;

  const statusDiff = activityPriority(a.status) - activityPriority(b.status);
  if (statusDiff !== 0) return statusDiff;

  const reviewA = a.reviewStartedAt ? 1 : 0;
  const reviewB = b.reviewStartedAt ? 1 : 0;
  if (reviewA !== reviewB) return reviewB - reviewA;

  const activityDiff = latestActivityMs(b) - latestActivityMs(a);
  if (activityDiff !== 0) return activityDiff;

  const numDiff = parseJobNumberSortKey(a.number) - parseJobNumberSortKey(b.number);
  if (numDiff !== 0) return numDiff;
  return a.number.localeCompare(b.number);
}

export function compareJobsByJobNumber(a: JobSortFields, b: JobSortFields): number {
  const statusDiff = compareStatusPriority(a, b);
  if (statusDiff !== 0) return statusDiff;
  const numDiff = parseJobNumberSortKey(b.number) - parseJobNumberSortKey(a.number);
  if (numDiff !== 0) return numDiff;
  return b.number.localeCompare(a.number);
}

export function sortJobs<T>(
  jobs: T[],
  mode: JobListSortMode,
  getFields: (job: T) => JobSortFields,
): T[] {
  const compare =
    mode === "jobNumber"
      ? compareJobsByJobNumber
      : mode === "recentlyUpdated"
        ? compareJobsByRecentlyUpdated
        : compareJobsByRecent;
  return [...jobs].sort((left, right) => compare(getFields(left), getFields(right)));
}
