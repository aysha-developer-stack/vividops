export type JobAttachmentUploadSpec = {
  file: File;
  fileCategory?: "job" | "completed";
  checklistItemId?: number;
};

/** One upload at a time — parallel uploads overload a single Railway instance and hit ~30s timeouts. */
const DEFAULT_CONCURRENCY = 1;

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;
  let index = 0;
  let firstError: Error | null = null;
  const workerCount = Math.min(Math.max(1, limit), items.length);

  const workers = Array.from({ length: workerCount }, async () => {
    while (index < items.length && !firstError) {
      const current = index;
      index += 1;
      try {
        await fn(items[current]!);
      } catch (err) {
        firstError = err instanceof Error ? err : new Error(String(err));
      }
    }
  });

  await Promise.all(workers);
  if (firstError) throw firstError;
}

async function uploadOne(
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
  options?: { concurrency?: number; suppressNotifications?: boolean },
): Promise<void> {
  if (specs.length === 0) return;

  const suppressNotifications = options?.suppressNotifications ?? false;
  const concurrency = options?.concurrency ?? DEFAULT_CONCURRENCY;

  let jobFileCount = 0;
  let checklistFileCount = 0;
  for (const spec of specs) {
    if (spec.checklistItemId != null) checklistFileCount += 1;
    else jobFileCount += 1;
  }

  await runWithConcurrency(specs, concurrency, (spec) =>
    uploadOne(jobId, spec, suppressNotifications),
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
