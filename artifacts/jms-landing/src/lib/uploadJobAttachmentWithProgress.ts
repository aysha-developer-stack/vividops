import { JOB_FILE_SUPABASE_SIZE_HINT } from "./uploadFileTypes";

export type JobAttachmentUploadFields = {
  fileCategory?: string;
  checklistItemId?: number;
  reviewNoteId?: string;
  reworkId?: string;
  uploadKind?: string;
  suppressNotifications?: boolean;
};

type PresignResponse = {
  signedUrl: string;
  token: string;
  key: string;
  fileUrl: string;
};

function parseUploadError(responseText: string, status: number): string {
  let message = `Upload failed (${status})`;
  try {
    const parsed = JSON.parse(responseText) as { message?: string };
    if (parsed.message) message = parsed.message;
  } catch {
    if (responseText.trim()) message = responseText.trim();
  }
  return formatUploadSizeError(message);
}

export function formatUploadSizeError(message: string): string {
  if (/maximum allowed size|payload too large|413|exceeds your supabase storage/i.test(message)) {
    return JOB_FILE_SUPABASE_SIZE_HINT;
  }
  return message;
}

function buildUploadBody(
  file: File,
  fields: JobAttachmentUploadFields,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    fileName: file.name,
    fileType: file.type || "application/octet-stream",
    fileSize: file.size,
  };
  if (fields.fileCategory) body.fileCategory = fields.fileCategory;
  if (fields.checklistItemId != null) body.checklistItemId = fields.checklistItemId;
  if (fields.reviewNoteId) body.reviewNoteId = fields.reviewNoteId;
  if (fields.reworkId) body.reworkId = fields.reworkId;
  if (fields.uploadKind) body.uploadKind = fields.uploadKind;
  if (fields.suppressNotifications) body.suppressNotifications = "true";
  return body;
}

function putFileWithProgress(
  url: string,
  file: File,
  contentType: string,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve();
        return;
      }
      reject(new Error(parseUploadError(xhr.responseText, xhr.status)));
    };
    xhr.onerror = () => reject(new Error("Direct storage upload failed"));
    xhr.send(file);
  });
}

/** Browser → Supabase direct upload with progress (avoids sending large files through Railway). */
export async function uploadJobAttachmentWithProgress(
  jobId: string,
  file: File,
  fields: JobAttachmentUploadFields,
  onProgress: (percent: number) => void,
): Promise<void> {
  const body = buildUploadBody(file, fields);
  onProgress(0);

  const presignRes = await fetch(`/api/jobs/${jobId}/attachments/presign`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!presignRes.ok) {
    const text = await presignRes.text();
    throw new Error(parseUploadError(text, presignRes.status));
  }

  const presign = (await presignRes.json()) as PresignResponse;
  const contentType = file.type || "application/octet-stream";

  await putFileWithProgress(presign.signedUrl, file, contentType, onProgress);

  const registerRes = await fetch(`/api/jobs/${jobId}/attachments/register`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, key: presign.key }),
  });
  if (!registerRes.ok) {
    const text = await registerRes.text();
    throw new Error(parseUploadError(text, registerRes.status));
  }
}

export function isStorageSizeLimitError(message: string): boolean {
  return /maximum allowed size|payload too large|413|exceeds your supabase storage|supabase storage size limit/i.test(
    message,
  );
}
