export type JobListSortMode = "recent" | "jobNumber";

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
  "In Progress": 0,
  "Awaiting Supervisor": 1,
  "Awaiting Admin": 2,
  Rework: 3,
  Overdue: 4,
  "On Hold": 5,
  "Not Started": 6,
  Done: 7,
};

const API_STATUS_PRIORITY: Record<string, number> = {
  in_progress: 0,
  awaiting_supervisor: 1,
  awaiting_admin: 2,
  rework: 3,
  on_hold: 5,
  pending: 6,
  cancelled: 6,
  completed: 7,
};

export const JOB_LIST_SORT_LABELS: Record<JobListSortMode, string> = {
  recent: "Recently",
  jobNumber: "Job number",
};

export const JOB_LIST_SORT_HINTS: Record<JobListSortMode, string> = {
  recent: "Newest created jobs first",
  jobNumber: "Sort by job number (lowest first)",
};

export const JOB_LIST_SORT_STORAGE_KEY = "jms_job_list_sort_v1";

export function readStoredJobListSort(): JobListSortMode {
  try {
    const raw = localStorage.getItem(JOB_LIST_SORT_STORAGE_KEY);
    if (raw === "recent" || raw === "jobNumber") return raw;
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

function timestampMs(iso: string | null | undefined): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

/** Latest touch: message, edit, or creation — used for recency within a status tier. */
function latestActivityMs(fields: JobSortFields): number {
  return Math.max(
    timestampMs(fields.lastMessageAt),
    timestampMs(fields.updatedAt),
    timestampMs(fields.createdAt),
  );
}

export function compareJobsByRecent(a: JobSortFields, b: JobSortFields): number {
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
  const numDiff = parseJobNumberSortKey(a.number) - parseJobNumberSortKey(b.number);
  if (numDiff !== 0) return numDiff;
  return a.number.localeCompare(b.number);
}

export function sortJobs<T>(
  jobs: T[],
  mode: JobListSortMode,
  getFields: (job: T) => JobSortFields,
): T[] {
  const compare =
    mode === "jobNumber" ? compareJobsByJobNumber : compareJobsByRecent;
  return [...jobs].sort((left, right) => compare(getFields(left), getFields(right)));
}
