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
