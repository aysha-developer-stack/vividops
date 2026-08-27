/** Download a file with an explicit local filename (not the storage/URL name). */
export async function downloadNamedFile(url: string, fileName: string): Promise<void> {
  const safeName = (fileName || "download").replace(/[/\\?%*:|"<>]/g, "_").trim() || "download";
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) {
    throw new Error(`Download failed (${res.status})`);
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = safeName;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

export function jobAttachmentDownloadUrl(jobId: string, attachmentId: string): string {
  return `/api/jobs/${jobId}/attachments/${attachmentId}/view?disposition=attachment`;
}

export function jobAttachmentPreviewUrl(jobId: string, attachmentId: string): string {
  return `/api/jobs/${jobId}/attachments/${attachmentId}/view?disposition=inline`;
}

export function sanitizeDownloadBaseName(raw: string, fallback = "download"): string {
  const cleaned = raw.replace(/[/\\?%*:|"<>]/g, "_").replace(/\s+/g, " ").trim().slice(0, 120);
  return cleaned || fallback;
}

export function jobAddressZipFileName(job: {
  address?: string | null;
  number?: string | null;
  title?: string | null;
}): string {
  const fallback = job.number?.trim() || job.title?.trim() || "job-files";
  return `${sanitizeDownloadBaseName(job.address?.trim() || fallback, fallback)}.zip`;
}

export function jobAttachmentsZipUrl(jobId: string, attachmentIds?: string[]): string {
  const params = new URLSearchParams();
  if (attachmentIds?.length) {
    params.set("attachmentIds", attachmentIds.join(","));
  }
  const qs = params.toString();
  return `/api/jobs/${jobId}/attachments/download-zip${qs ? `?${qs}` : ""}`;
}

export async function downloadJobAttachmentsZip(
  jobId: string,
  zipFileName: string,
  attachmentIds?: string[],
): Promise<void> {
  await downloadNamedFile(jobAttachmentsZipUrl(jobId, attachmentIds), zipFileName);
}
