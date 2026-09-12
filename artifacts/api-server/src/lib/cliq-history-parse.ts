import { inboundCliqHasAttachment } from "./cliq-message-attachments";

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
