export type CliqAttachmentRef = {
  fileName: string;
  url: string;
};

export type CliqFileRef = {
  fileId: string;
  fileName: string;
};

function pickString(...values: unknown[]): string {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\/\S+$/i.test(value);
}

export function cliqFileProxyUrl(fileId: string, disposition: "inline" | "attachment" = "inline"): string {
  return `/api/cliq/files/${encodeURIComponent(fileId)}/view?disposition=${disposition}`;
}

function isViewableAttachmentUrl(value: string): boolean {
  return (
    isHttpUrl(value) ||
    /^\/api\/jobs\/[^/]+\/attachments\/[^/]+\/view(\?.*)?$/i.test(value) ||
    /^\/api\/cliq\/files\/[^/]+\/view(\?.*)?$/i.test(value)
  );
}

function attachmentFromRecord(record: Record<string, unknown>, fallbackName = "attachment"): CliqAttachmentRef | null {
  const url = pickString(
    record.url,
    record.file_url,
    record.fileUrl,
    record.download_url,
    record.downloadUrl,
    record.permalink,
    record.link,
    record.href,
  );
  if (!isViewableAttachmentUrl(url)) return null;
  const fileName =
    pickString(record.name, record.file_name, record.fileName, record.title, record.filename) ||
    fallbackName;
  return { fileName, url };
}

function fileRefFromRecord(record: Record<string, unknown>, fallbackName = "attachment"): CliqFileRef | null {
  const fileId = pickString(record.id, record.file_id, record.fileId);
  if (!fileId) return null;
  const fileName =
    pickString(record.name, record.file_name, record.fileName, record.title, record.filename) ||
    fallbackName;
  return { fileId, fileName };
}

function nestedRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

/** Cliq file messages store the file under content.file (id + name, often no public URL). */
export function parseCliqFileRefFromPayload(payload: unknown): CliqFileRef | null {
  if (!payload || typeof payload !== "object") return null;
  const obj = payload as Record<string, unknown>;

  const directId = pickString(obj.fileId, obj.file_id);
  const directName = pickString(obj.fileName, obj.file_name);
  if (directId) {
    return { fileId: directId, fileName: directName || "attachment" };
  }

  const nestedSources: unknown[] = [
    obj.file,
    obj.attachment,
    nestedRecord(obj.message)?.file,
    nestedRecord(obj.message)?.attachment,
    nestedRecord(nestedRecord(obj.message)?.content)?.file,
    nestedRecord(obj.data)?.file,
    nestedRecord(nestedRecord(obj.data)?.content)?.file,
  ];

  for (const source of nestedSources) {
    const record = nestedRecord(source);
    if (!record) continue;
    const parsed = fileRefFromRecord(record);
    if (parsed) return parsed;
  }

  const listSources = [
    obj.attachments,
    obj.files,
    nestedRecord(obj.message)?.attachments,
    nestedRecord(obj.message)?.files,
  ];
  for (const list of listSources) {
    if (!Array.isArray(list) || list.length === 0) continue;
    const first = nestedRecord(list[0]);
    if (first) {
      const parsed = fileRefFromRecord(first);
      if (parsed) return parsed;
    }
  }

  return null;
}

/** Extract file metadata from a Cliq bot webhook payload (Deluge or REST shapes). */
export function parseAttachmentFromCliqPayload(payload: unknown): CliqAttachmentRef | null {
  if (!payload || typeof payload !== "object") return null;
  const obj = payload as Record<string, unknown>;

  const top = attachmentFromRecord(obj, "attachment");
  if (top) return top;

  const nestedSources = [
    obj.file,
    obj.attachment,
    nestedRecord(obj.message)?.file,
    nestedRecord(obj.message)?.attachment,
    nestedRecord(nestedRecord(obj.message)?.content)?.file,
    nestedRecord(obj.data)?.file,
    nestedRecord(nestedRecord(obj.data)?.content)?.file,
  ];
  for (const source of nestedSources) {
    const record = nestedRecord(source);
    if (!record) continue;
    const parsed = attachmentFromRecord(record);
    if (parsed) return parsed;
  }

  const listSources = [
    obj.attachments,
    obj.files,
    nestedRecord(obj.message)?.attachments,
    nestedRecord(obj.message)?.files,
  ];
  for (const list of listSources) {
    if (!Array.isArray(list) || list.length === 0) continue;
    const first = nestedRecord(list[0]);
    if (first) {
      const parsed = attachmentFromRecord(first);
      if (parsed) return parsed;
    }
  }

  const fileUrl = pickString(obj.fileUrl, obj.file_url, obj.downloadUrl, obj.download_url);
  const fileName = pickString(obj.fileName, obj.file_name, obj.attachmentName, obj.attachment_name);
  if (fileUrl && isViewableAttachmentUrl(fileUrl)) {
    return { fileName: fileName || "attachment", url: fileUrl };
  }

  const fileRef = parseCliqFileRefFromPayload(payload);
  if (fileRef) {
    return {
      fileName: fileRef.fileName,
      url: cliqFileProxyUrl(fileRef.fileId),
    };
  }

  return null;
}

export function formatSharedAttachmentMessage(fileName: string, url: string): string {
  return `Shared attachment: ${fileName}\n${url}`;
}

const CLIQ_FILE_TEXT_RE =
  /^(updated file|shared (?:a )?file|uploaded (?:a )?file|attached (?:a )?file|file shared|shared an attachment)/i;

/** Normalize inbound Cliq message text; embed attachment URL when payload includes file metadata. */
export function formatInboundCliqMessageText(text: string, rawPayload: unknown): string {
  const trimmed = text.trim();
  const attachment = parseAttachmentFromCliqPayload(rawPayload);
  if (attachment) {
    return formatSharedAttachmentMessage(attachment.fileName, attachment.url);
  }
  if (CLIQ_FILE_TEXT_RE.test(trimmed)) {
    return trimmed;
  }
  return trimmed;
}

/** Re-enrich stored messages for API responses (legacy rows + payload-only attachments). */
export function enrichStoredMessageText(text: string, rawPayload: unknown): string {
  if (/^Shared attachment:/i.test(text.trim())) return text;
  return formatInboundCliqMessageText(text, rawPayload);
}

export function inboundCliqHasAttachment(payload: unknown): boolean {
  return parseAttachmentFromCliqPayload(payload) !== null || parseCliqFileRefFromPayload(payload) !== null;
}
