import type { Job as ApiJob } from "@workspace/api-client-react";
import { priorityToUi, type UiPriority } from "@/lib/jobMappers";
import { parseJobMeta, type ChecklistTemplateItem } from "@/lib/jobMeta";
import type { Role } from "@/lib/roles";

export const JOB_TITLE_OPTIONS = [
  "Structural Inspection",
  "Engineering",
  "Architectural Plan",
  "Earth Work",
  "Retaining Wall",
  "Plumbing/Drainage",
  "Hydraulic Plan/Strome Water",
  "Robot Structure",
] as const;

export const WIND_OPTIONS = ["N2", "N3", "N4", "N5", "C1", "C2"] as const;
export type WindOption = (typeof WIND_OPTIONS)[number];

export const PRIORITY_BUTTON_CONFIG: Record<UiPriority, { dot: string }> = {
  Low: { dot: "bg-gray-400" },
  Medium: { dot: "bg-amber-500" },
  High: { dot: "bg-red-500" },
};

export type JobFormState = {
  jobNumber: string;
  title: string;
  client: string;
  address: string;
  description: string;
  supervisorId: string;
  assigneeId: string;
  priority: UiPriority;
  estimatedTime: string;
  startDate: string;
  eta: string;
  wind: "" | WindOption;
  incomingDate: string;
  due: string;
  remarks: string;
  comments: string;
};

export const EMPTY_JOB_FORM: JobFormState = {
  jobNumber: "",
  title: "",
  client: "",
  address: "",
  description: "",
  supervisorId: "",
  assigneeId: "",
  priority: "Medium",
  estimatedTime: "",
  startDate: "",
  eta: "",
  wind: "",
  incomingDate: "",
  due: "",
  remarks: "",
  comments: "",
};

export type JobWithChecklist = ApiJob & {
  checklist?: ChecklistTemplateItem[];
  descriptionText?: string | null;
  estimatedTime?: string | null;
  startDate?: string | null;
  eta?: string | null;
  wind?: string | null;
  incomingDate?: string | null;
  remarks?: string | null;
  comments?: string | null;
};

export function toJobDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toISOString().slice(0, 10);
}

export function applyJobToForm(
  job: JobWithChecklist,
  extras: string[],
  role: Role,
  currentUserId?: string,
) {
  const meta = parseJobMeta(job.description ?? null);
  const checklist =
    Array.isArray(job.checklist) && job.checklist.length > 0
      ? job.checklist
      : meta.checklist;
  const descriptionText =
    typeof job.descriptionText === "string" ? job.descriptionText : meta.descriptionText;
  const assigneeId = job.assignee?.role === "user" ? job.assignee.id : "";
  const memberIdsFromApi =
    extras.length > 0
      ? extras
      : (job.assignees ?? [])
          .filter((a) => a.role === "user" && a.id !== assigneeId)
          .map((a) => a.id);
  const windValue: "" | WindOption = WIND_OPTIONS.includes(job.wind as WindOption)
    ? (job.wind as WindOption)
    : "";
  return {
    form: {
      jobNumber: job.number.replace(/^JOB-/i, ""),
      title: job.title,
      client: job.client,
      address: job.address ?? "",
      description: descriptionText,
      supervisorId:
        job.supervisor?.id ??
        (role === "supervisor" ? (currentUserId ?? "") : ""),
      assigneeId,
      priority: priorityToUi(job.priority),
      estimatedTime: job.estimatedTime ?? "",
      startDate: toJobDateInput(job.startDate),
      eta: toJobDateInput(job.eta),
      wind: windValue,
      incomingDate: toJobDateInput(job.incomingDate),
      due: toJobDateInput(job.dueDate),
      remarks: job.remarks ?? "",
      comments: job.comments ?? "",
    },
    checklist,
    memberIds: memberIdsFromApi,
  };
}

export type ExistingJobAttachment = {
  id: string;
  fileName: string;
  fileSize?: string | null;
  fileUrl?: string | null;
};

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
