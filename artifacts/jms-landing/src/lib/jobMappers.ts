import type { Job as ApiJob, JobStatus, JobPriority } from "@workspace/api-client-react";

export type UiStatus =
  | "Pending"
  | "In Progress"
  | "Awaiting Supervisor"
  | "Awaiting Admin"
  | "Completed"
  | "Overdue"
  | "Rework";
export type UiPriority = "Low" | "Medium" | "High";

const STATUS_API_TO_UI: Record<string, UiStatus> = {
  pending: "Pending",
  in_progress: "In Progress",
  awaiting_supervisor: "Awaiting Supervisor",
  awaiting_admin: "Awaiting Admin",
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
  "Awaiting Supervisor": "awaiting_supervisor",
  "Awaiting Admin": "awaiting_admin",
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
  return STATUS_API_TO_UI[j.status] ?? "Pending";
}

export function priorityToUi(p: JobPriority): UiPriority {
  return PRIORITY_API_TO_UI[p];
}

export function formatShortDate(iso: string | null | undefined, format: string = "MM/DD/YYYY"): string {
  if (!iso) return "—";
  const d = new Date(iso);
  
  if (format === "DD/MM/YYYY") {
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  } else if (format === "YYYY-MM-DD") {
    return d.toISOString().split('T')[0];
  }
  
  return d.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
}

export function formatCurrency(amount: number, currency: string = "USD ($)"): string {
  const symbol = currency.includes("($)") ? "$" : currency.includes("(Γé¼)") ? "Γé¼" : currency.includes("(┬ú)") ? "┬ú" : currency.includes("(┬Ñ)") ? "┬Ñ" : "$";
  const code = currency.split(' ')[0];
  
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: code,
  }).format(amount);
}

export function daysUntil(iso: string | null | undefined): number {
  if (!iso) return 9999;
  
  // Normalize both dates to the start of the day for accurate calendar day comparison
  const target = new Date(iso);
  target.setHours(0, 0, 0, 0);
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const diffTime = target.getTime() - today.getTime();
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}
