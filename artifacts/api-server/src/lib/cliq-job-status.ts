import type { JobRow, UserRow } from "@workspace/db";
import { formatCliqActivityTime, postCliqJobAnnouncement } from "./cliq-member-activity";
import { logger } from "./logger";
import { reworkOriginLabel, type ReworkOrigin } from "./rework-origin";

export type CliqJobStatusEvent =
  | "completed"
  | "rework"
  | "rework_completed"
  | "awaiting_supervisor"
  | "awaiting_admin"
  | "awaiting_super_admin"
  | "on_hold"
  | "resumed"
  | "cancelled";

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
    if (actor.role === "super-admin") {
      return `✅ ${label} approved and completed by ${actorName} · ${time}`;
    }
    if (actor.role === "admin") {
      return `✅ ${label} completed by admin ${actorName} · ${time}`;
    }
    return null;
  }

  if (event === "awaiting_supervisor") {
    if (previousStatus === "rework") {
      return `✅ Rework completed on ${label} — submitted for supervisor review by ${actorName} · ${time}`;
    }
    return `📋 ${label} submitted for supervisor review by ${actorName} · ${time}`;
  }

  if (event === "awaiting_admin") {
    if (actor.role === "supervisor") {
      return `✔️ ${label} approved by supervisor ${actorName} — awaiting admin review · ${time}`;
    }
    if (actor.role === "user") {
      return `📋 ${label} submitted for admin review by ${actorName} · ${time}`;
    }
    return `✔️ ${label} forwarded for admin review by ${actorName} · ${time}`;
  }

  if (event === "awaiting_super_admin") {
    return `✔️ ${label} reviewed by admin ${actorName} — awaiting super admin completion · ${time}`;
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

  if (event === "rework_completed") {
    return `✅ Rework completed on ${label} by ${actorName} · ${time}`;
  }

  if (event === "on_hold") {
    let line = `⏸️ ${label} put on hold by ${actorName} · ${time}`;
    if (reasonText) line += `\nReason: ${reasonText}`;
    return line;
  }

  if (event === "resumed") {
    return `▶️ ${label} resumed by ${actorName} · ${time}`;
  }

  if (event === "cancelled") {
    return `🚫 ${label} cancelled by ${actorName} · ${time}`;
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
