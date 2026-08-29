import {
  isStorageSizeLimitError,
  uploadJobAttachmentWithProgress,
  type JobAttachmentUploadFields,
} from "./uploadJobAttachmentWithProgress";

export type JobAttachmentUploadSpec = {
  file: File;
  fileCategory?: "job" | "completed" | "review";
  checklistItemId?: number;
  reviewNoteId?: string;
  reworkId?: string;
};

/** Direct browser → Supabase uploads; Railway only handles small JSON presign/register calls. */
const DEFAULT_CONCURRENCY = 4;

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
  onProgress?: (completed: number, total: number) => void,
): Promise<void> {
  if (items.length === 0) return;
  let index = 0;
  let completed = 0;
  let firstError: Error | null = null;
  const workerCount = Math.min(Math.max(1, limit), items.length);
  const total = items.length;

  const workers = Array.from({ length: workerCount }, async () => {
    while (index < items.length && !firstError) {
      const current = index;
      index += 1;
      try {
        await fn(items[current]!);
        completed += 1;
        onProgress?.(completed, total);
      } catch (err) {
        firstError = err instanceof Error ? err : new Error(String(err));
      }
    }
  });

  await Promise.all(workers);
  if (firstError) throw firstError;
}

function specToFields(
  spec: JobAttachmentUploadSpec,
  suppressNotifications: boolean,
): JobAttachmentUploadFields {
  return {
    fileCategory: spec.fileCategory,
    checklistItemId: spec.checklistItemId,
    reviewNoteId: spec.reviewNoteId,
    reworkId: spec.reworkId,
    suppressNotifications,
  };
}

async function uploadViaProxy(
  jobId: string,
  spec: JobAttachmentUploadSpec,
  suppressNotifications: boolean,
): Promise<void> {
  const fd = new FormData();
  fd.append("file", spec.file);
  if (spec.fileCategory) fd.append("fileCategory", spec.fileCategory);
  if (spec.checklistItemId != null) {
    fd.append("checklistItemId", String(spec.checklistItemId));
  }
  if (spec.reviewNoteId) fd.append("reviewNoteId", spec.reviewNoteId);
  if (spec.reworkId) fd.append("reworkId", spec.reworkId);
  if (suppressNotifications) fd.append("suppressNotifications", "true");

  const res = await fetch(`/api/jobs/${jobId}/attachments`, {
    method: "POST",
    body: fd,
    credentials: "include",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Upload failed (${res.status})`);
  }
}

async function uploadDirect(
  jobId: string,
  spec: JobAttachmentUploadSpec,
  suppressNotifications: boolean,
): Promise<void> {
  await uploadJobAttachmentWithProgress(
    jobId,
    spec.file,
    specToFields(spec, suppressNotifications),
    () => {},
  );
}

async function uploadOne(
  jobId: string,
  spec: JobAttachmentUploadSpec,
  suppressNotifications: boolean,
): Promise<void> {
  try {
    await uploadDirect(jobId, spec, suppressNotifications);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (isStorageSizeLimitError(message)) {
      throw err;
    }
    await uploadViaProxy(jobId, spec, suppressNotifications);
  }
}

async function notifyBulkUpload(
  jobId: string,
  jobFileCount: number,
  checklistFileCount: number,
): Promise<void> {
  const res = await fetch(`/api/jobs/${jobId}/attachments/bulk-notify`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobFileCount, checklistFileCount }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Bulk notify failed (${res.status})`);
  }
}

/** Upload many job files with limited parallelism; optional single notification at the end. */
export async function uploadJobAttachmentsBatch(
  jobId: string,
  specs: JobAttachmentUploadSpec[],
  options?: {
    concurrency?: number;
    suppressNotifications?: boolean;
    onProgress?: (completed: number, total: number) => void;
  },
): Promise<void> {
  if (specs.length === 0) return;

  const suppressNotifications = options?.suppressNotifications ?? false;
  const concurrency = options?.concurrency ?? DEFAULT_CONCURRENCY;
  const onProgress = options?.onProgress;

  let jobFileCount = 0;
  let checklistFileCount = 0;
  for (const spec of specs) {
    if (spec.checklistItemId != null) checklistFileCount += 1;
    else jobFileCount += 1;
  }

  onProgress?.(0, specs.length);

  await runWithConcurrency(
    specs,
    concurrency,
    (spec) => uploadOne(jobId, spec, suppressNotifications),
    onProgress,
  );

  if (suppressNotifications) {
    await notifyBulkUpload(jobId, jobFileCount, checklistFileCount);
  }
}

export function buildJobSaveUploadSpecs(
  jobFiles: File[],
  checklistItemFiles: Record<number, File[]>,
): JobAttachmentUploadSpec[] {
  const specs: JobAttachmentUploadSpec[] = jobFiles.map((file) => ({
    file,
    fileCategory: "job",
  }));

  for (const [indexStr, files] of Object.entries(checklistItemFiles)) {
    const itemId = Number(indexStr) + 1;
    if (!Number.isFinite(itemId) || itemId <= 0) continue;
    for (const file of files) {
      specs.push({ file, checklistItemId: itemId });
    }
  }

  return specs;
}
