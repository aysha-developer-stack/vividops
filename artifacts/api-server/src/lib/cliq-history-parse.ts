import {
  inboundCliqHasAttachment,
  parseAttachmentFromCliqPayload,
  parseCliqFileRefFromPayload,
} from "./cliq-message-attachments";

export const CLIQ_DEDUP_WINDOW_MS = 10 * 60 * 1000;

type JobNameFields = {
  jobNumber?: string | null;
  serial?: number | string | null;
  title?: string | null;
};

export function normalizeMirroredCliqText(job: JobNameFields, text: string): { text: string; wasMirrored: boolean } {
  const trimmed = text.trim();
  const prefixes = [
    `JOB-${job.jobNumber?.trim() || job.serial} - ${job.title}`,
    `JOB-${job.serial} · ${job.title}`,
  ];
  const prefix = prefixes.find((p) => trimmed.startsWith(`${p}\n`));
  if (!prefix) return { text: trimmed, wasMirrored: false };
  const remainder = trimmed.slice(prefix.length + 1).trim();
  const website = remainder.match(/^(?:From website|Vivid OPS)\s*\(([^)]+)\):\s*([\s\S]+)$/i);
  if (website?.[2]) return { text: website[2].trim(), wasMirrored: true };
  const generic = remainder.match(/^[^:\n]{1,120}:\s*([\s\S]+)$/);
  return { text: generic?.[1]?.trim() || remainder, wasMirrored: true };
}

export function cliqSenderDisplayName(source: string | null | undefined, payload: unknown, fallback: string): string {
  if (source !== "zoho_cliq" || !payload || typeof payload !== "object") return fallback;
  const obj = payload as Record<string, unknown>;
  if (obj.opsUsedSyncUser === true) {
    const name = typeof obj.opsSenderName === "string" ? obj.opsSenderName.trim() : "";
    if (name) return name;
  }
  return fallback;
}

function pickString(...values: unknown[]): string {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

export function cliqExternalIdCandidates(id: string): string[] {
  const trimmed = id.trim();
  if (!trimmed) return [];
  const aliases = [trimmed];
  const match = /^(\d{10,})(?:_(\d+))?$/.exec(trimmed);
  if (match?.[1]) {
    aliases.push(match[1]);
    aliases.push(`${match[1]}_1`);
    if (match[2] && match[2] !== "1") aliases.push(`${match[1]}_${match[2]}`);
  }
  return [...new Set(aliases)];
}

export function cliqDedupeKey(text: string, payload?: unknown): string {
  const file = parseCliqFileRefFromPayload(payload);
  if (file?.fileId) return `file:${file.fileId}`;
  const attachment = parseAttachmentFromCliqPayload(payload);
  if (attachment?.fileName) return `file:${attachment.fileName.trim().toLowerCase()}`;
  const shared = text.match(/^Shared attachment:\s*(.+)$/im);
  if (shared?.[1]) {
    const fileName = shared[1].split("\n")[0]?.trim().toLowerCase();
    if (fileName) return `file:${fileName}`;
  }
  return `text:${text.trim().toLowerCase()}`;
}

export function cliqSenderDedupeKey(senderEmail?: string | null, senderName?: string | null, userId?: string | null): string {
  const email = senderEmail?.trim().toLowerCase();
  if (email) return `email:${email}`;
  const name = senderName?.trim().toLowerCase();
  if (name) return `name:${name}`;
  const uid = userId?.trim();
  if (uid) return `user:${uid}`;
  return "unknown";
}

export function isWithinCliqDedupeWindow(a: Date | string | number, b: Date | string | number, windowMs = CLIQ_DEDUP_WINDOW_MS): boolean {
  const left = a instanceof Date ? a.getTime() : new Date(a).getTime();
  const right = b instanceof Date ? b.getTime() : new Date(b).getTime();
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  return Math.abs(left - right) <= windowMs;
}

export function parseCliqCreatedAt(raw: unknown): Date | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const message = obj.message && typeof obj.message === "object" ? (obj.message as Record<string, unknown>) : null;
  const timeMs =
    parseEpochMs(obj.time) ??
    parseEpochMs(obj.timestamp) ??
    parseEpochMs(obj.created_time) ??
    parseEpochMs(obj.createdAt) ??
    parseEpochMs(message?.time) ??
    parseEpochMs(message?.timestamp);
  return timeMs != null ? new Date(timeMs) : null;
}

function parseEpochMs(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const asNum = Number(value);
    if (Number.isFinite(asNum) && asNum > 1_000_000_000) return asNum;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export type ParsedCliqHistoryMessage = {
  externalMessageId: string | null;
  text: string;
  senderEmail: string;
  senderName: string;
  senderId: string;
  createdAt: Date | null;
  rawPayload: unknown;
};

export function parseCliqHistoryMessage(raw: unknown): ParsedCliqHistoryMessage | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const sender = obj.sender && typeof obj.sender === "object" ? (obj.sender as Record<string, unknown>) : null;
  const content = obj.content && typeof obj.content === "object" ? (obj.content as Record<string, unknown>) : null;
  const isFile = pickString(obj.type).toLowerCase() === "file";

  const text =
    pickString(
      obj.text,
      content?.text,
      content?.comment,
      obj.comment,
      typeof obj.message === "string" ? obj.message : "",
    ) || (isFile || inboundCliqHasAttachment(raw) ? "Shared a file" : "");

  const senderEmail = pickString(
    sender?.email,
    sender?.email_id,
    sender?.emailId,
    obj.sender_email,
    obj.email,
  ).toLowerCase();
  const senderName = pickString(
    sender?.name,
    sender?.display_name,
    sender?.first_name && sender?.last_name ? `${sender.first_name} ${sender.last_name}` : "",
    obj.sender_name,
    senderEmail,
    "Cliq user",
  );
  const senderId = pickString(sender?.id, sender?.user_id, sender?.userId);
  const externalMessageId = pickString(obj.id, obj.message_id, obj.messageId) || null;
  const timeMs = parseEpochMs(obj.time) ?? parseEpochMs(obj.timestamp) ?? parseEpochMs(obj.created_time);
  const createdAt = timeMs != null ? new Date(timeMs) : null;

  if (!text && !isFile && !inboundCliqHasAttachment(raw)) return null;
  return {
    externalMessageId,
    text: text || "Shared a file",
    senderEmail,
    senderName,
    senderId,
    createdAt,
    rawPayload: raw,
  };
}
