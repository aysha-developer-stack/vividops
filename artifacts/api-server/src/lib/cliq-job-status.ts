import type { JobRow, UserRow } from "@workspace/db";
import { formatCliqActivityTime, postCliqJobAnnouncement } from "./cliq-member-activity";
import { logger } from "./logger";
import { reworkOriginLabel, type ReworkOrigin } from "./rework-origin";

export type CliqJobStatusEvent =
  | "completed"
  | "rework"
  | "awaiting_supervisor"
  | "awaiting_admin";

function jobLabel(job: JobRow): string {
  const num = job.jobNumber?.trim();
  return num ? `JOB-${num}` : job.title?.trim() || "Job";
}

function trimDetail(value: string | null | undefined, max = 240): string {
  const text = (value ?? "").trim();
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function buildCliqJobStatusText(opts: {
  job: JobRow;
  actor: UserRow;
  event: CliqJobStatusEvent;
  previousStatus?: string;
  reason?: string | null;
  comments?: string | null;
  reworkOrigin?: ReworkOrigin | null;
  checklistItemId?: number | null;
}): string | null {
  const { job, actor, event, previousStatus, reason, comments, reworkOrigin, checklistItemId } = opts;
  const label = jobLabel(job);
  const actorName = actor.name?.trim() || "Someone";
  const time = formatCliqActivityTime();
  const reasonText = trimDetail(reason);
  const commentText = trimDetail(comments);

  if (event === "completed") {
    const coveredSupervisor =
      (actor.role === "admin" || actor.role === "super-admin") &&
      (previousStatus === "awaiting_supervisor" || previousStatus === "in_progress");
    const action = coveredSupervisor ? "checked and completed" : "marked completed";
    return `✅ ${label} ${action} by ${actorName} · ${time}`;
  }

  if (event === "awaiting_supervisor") {
    return `📋 ${label} submitted for supervisor review by ${actorName} · ${time}`;
  }

  if (event === "awaiting_admin") {
    const bySupervisor = actor.role === "supervisor";
    return bySupervisor
      ? `✔️ ${label} approved by supervisor ${actorName} — awaiting admin completion · ${time}`
      : `✔️ ${label} forwarded for admin completion by ${actorName} · ${time}`;
  }

  if (event === "rework") {
    const origin = reworkOriginLabel(reworkOrigin ?? null);
    const originTag = origin ? `${origin} · ` : "";
    const itemTag = checklistItemId ? ` (checklist item #${checklistItemId})` : "";
    let line = `🔄 ${originTag}Rework requested on ${label}${itemTag} by ${actorName} · ${time}`;
    if (reasonText) line += `\nReason: ${reasonText}`;
    if (commentText) line += `\nInstructions: ${commentText}`;
    return line;
  }

  return null;
}

/** Post a job status line to the linked Cliq channel (best-effort, never throws). */
export async function announceCliqJobStatusChange(opts: {
  job: JobRow;
  actor: UserRow;
  event: CliqJobStatusEvent;
  previousStatus?: string;
  reason?: string | null;
  comments?: string | null;
  reworkOrigin?: ReworkOrigin | null;
  checklistItemId?: number | null;
}): Promise<void> {
  const text = buildCliqJobStatusText(opts);
  if (!text) return;

  try {
    await postCliqJobAnnouncement(opts.job, text);
  } catch (err) {
    logger.warn({ err, jobId: opts.job.id, event: opts.event }, "[CLIQ-STATUS] Failed to announce job status");
  }
}
