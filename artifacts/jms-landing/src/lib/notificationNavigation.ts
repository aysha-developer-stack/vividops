import type { Role } from "./roles";
import { ROLES } from "./roles";

export type NotificationLinkInput = {
  type: string;
  jobId?: string | null;
};

const JOB_TABS: Record<string, string> = {
  job_message: "communication",
  checklist: "checklist",
  file: "files",
  timer: "logs",
  rework: "mistakes",
  error: "mistakes",
  assigned: "overview",
  updated: "overview",
  overdue: "overview",
  completed: "overview",
};

export function getNotificationPath(role: Role, notification: NotificationLinkInput): string {
  const base = ROLES[role].base;

  if (notification.jobId) {
    const tab = JOB_TABS[notification.type];
    return tab ? `${base}/jobs/${notification.jobId}?tab=${tab}` : `${base}/jobs/${notification.jobId}`;
  }

  if (notification.type === "training") {
    return `${base}/training`;
  }
  if (notification.type === "progress") {
    return `${base}/reports`;
  }

  return `${base}/notifications`;
}

export function notificationIsNavigable(notification: NotificationLinkInput): boolean {
  if (notification.jobId) return true;
  return notification.type === "training" || notification.type === "progress";
}
