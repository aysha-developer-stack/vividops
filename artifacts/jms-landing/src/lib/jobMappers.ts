import type { Job as ApiJob, JobStatus, JobPriority } from "@workspace/api-client-react";

export type UiStatus = "Pending" | "In Progress" | "Completed" | "Overdue" | "Rework";
export type UiPriority = "Low" | "Medium" | "High";

const STATUS_API_TO_UI: Record<string, UiStatus> = {
  pending: "Pending",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Pending",
  rework: "Rework",
};

const PRIORITY_API_TO_UI: Record<JobPriority, UiPriority> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

export const STATUS_UI_TO_API: Record<Exclude<UiStatus, "Overdue">, string> = {
  Pending: "pending",
  "In Progress": "in_progress",
  Completed: "completed",
  Rework: "rework",
};

export const PRIORITY_UI_TO_API: Record<UiPriority, JobPriority> = {
  Low: "low",
  Medium: "medium",
  High: "high",
};

export function statusToUi(j: ApiJob): UiStatus {
  if (j.isOverdue) return "Overdue";
  return STATUS_API_TO_UI[j.status];
}

export function priorityToUi(p: JobPriority): UiPriority {
  return PRIORITY_API_TO_UI[p];
}

export function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
}

export function daysUntil(iso: string | null | undefined): number {
  if (!iso) return 9999;
  const ms = new Date(iso).getTime() - Date.now();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}
