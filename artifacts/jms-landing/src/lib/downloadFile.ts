/** Start a browser download without buffering the whole file in JavaScript memory. */
export function triggerBrowserFileDownload(url: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.rel = "noopener";
  a.target = "_blank";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Download via same-origin API (redirects to Supabase CDN for large files). */
export async function downloadNamedFile(url: string, _fileName: string): Promise<void> {
  triggerBrowserFileDownload(url);
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
  _zipFileName: string,
  attachmentIds?: string[],
): Promise<void> {
  triggerBrowserFileDownload(jobAttachmentsZipUrl(jobId, attachmentIds));
}
