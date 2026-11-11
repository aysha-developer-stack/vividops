import type { Role } from "./roles";
import { ROLES } from "./roles";

export type NotificationLinkInput = {
  type: string;
  jobId?: string | null;
  title?: string | null;
  description?: string | null;
};

export const JOB_DETAIL_TAB_IDS = [
  "overview",
  "files",
  "notes",
  "communication",
  "logs",
  "completion",
  "mistakes",
  "appreciation",
] as const;

export type JobDetailTabId = (typeof JOB_DETAIL_TAB_IDS)[number];

const TYPE_TO_TAB: Record<string, JobDetailTabId> = {
  job_message: "communication",
  cliq_channel: "communication",
  checklist: "files",
  file: "files",
  timer: "logs",
  rework: "mistakes",
  error: "mistakes",
  appreciation: "appreciation",
  note: "notes",
  assigned: "overview",
  admin_ops: "overview",
  overdue: "overview",
  completed: "overview",
  updated: "overview",
};

function looksLikeJobNote(notification: NotificationLinkInput): boolean {
  const title = (notification.title ?? "").trim().toLowerCase();
  const description = (notification.description ?? "").trim().toLowerCase();
  if (title.startsWith("new note on") || title.startsWith("note updated on") || title.startsWith("note removed on")) {
    return true;
  }
  return /added a \w+ note:/.test(description) || /added a note:/.test(description) || /edited a note:/.test(description) || /deleted a note:/.test(description);
}

function looksLikeCompletionComment(notification: NotificationLinkInput): boolean {
  const title = (notification.title ?? "").trim().toLowerCase();
  const description = (notification.description ?? "").trim().toLowerCase();
  if (title.startsWith("new comment on")) return true;
  return /\bnote:\s+\S/.test(description);
}

export function jobTabForNotification(notification: NotificationLinkInput): JobDetailTabId | null {
  if (notification.type === "training" || notification.type === "progress") return null;
  if (notification.type === "note" || looksLikeJobNote(notification)) return "notes";
  if (TYPE_TO_TAB[notification.type]) return TYPE_TO_TAB[notification.type];
  if (notification.jobId) return "overview";
  return null;
}

export function jobTabsForNotification(notification: NotificationLinkInput): JobDetailTabId[] {
  const tabs: JobDetailTabId[] = [];
  const primary = jobTabForNotification(notification);
  if (primary) tabs.push(primary);
  if (looksLikeCompletionComment(notification) && !tabs.includes("completion") && !looksLikeJobNote(notification)) {
    tabs.push("completion");
  }
  return tabs;
}

export function getNotificationPath(role: Role, notification: NotificationLinkInput): string {
  const base = ROLES[role].base;

  if (notification.jobId) {
    const tab = jobTabForNotification(notification);
    return tab ? `${base}/jobs/${notification.jobId}?tab=${tab}` : `${base}/jobs/${notification.jobId}`;
  }

  if (notification.type === "training") {
    return `${base}/training`;
  }
  if (notification.type === "progress") {
    return `${base}/reports`;
  }
  if (notification.type === "appreciation") {
    return `${base}/appreciation`;
  }

  return `${base}/notifications`;
}

export function notificationIsNavigable(notification: NotificationLinkInput): boolean {
  if (notification.jobId) return true;
  return (
    notification.type === "training" ||
    notification.type === "progress" ||
    notification.type === "appreciation"
  );
}
