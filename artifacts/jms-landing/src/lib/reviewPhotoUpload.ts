import { uploadJobAttachmentsBatch } from "@/lib/uploadJobAttachmentsBatch";
import {
  MAX_REVIEW_PHOTOS,
  MAX_REVIEW_PHOTO_BYTES,
  isReviewPhotoFileAllowed,
} from "@/lib/uploadFileTypes";

export function validateReviewPhotos(files: File[]): string | null {
  if (files.length > MAX_REVIEW_PHOTOS) {
    return `You can attach up to ${MAX_REVIEW_PHOTOS} photos.`;
  }
  for (const file of files) {
    if (file.size > MAX_REVIEW_PHOTO_BYTES) {
      return `${file.name} exceeds the 10MB limit.`;
    }
    if (!isReviewPhotoFileAllowed(file.name)) {
      return `${file.name} is not a supported image format.`;
    }
  }
  return null;
}

export async function uploadReviewPhotos(
  jobId: string,
  files: File[],
  reviewNoteId: string,
  onProgress?: (completed: number, total: number) => void,
): Promise<void> {
  if (files.length === 0) return;
  await uploadJobAttachmentsBatch(
    jobId,
    files.map((file) => ({
      file,
      fileCategory: "review" as const,
      reviewNoteId,
    })),
    {
      suppressNotifications: true,
      concurrency: 6,
      onProgress,
    },
  );
}

export type JobReviewAction =
  | "submit_for_supervisor"
  | "supervisor_approve"
  | "admin_complete"
  | "admin_finalize";

export async function submitJobReviewWithPhotos(opts: {
  jobId: string;
  action: JobReviewAction;
  comment: string;
  photos: File[];
  onProgress?: (message: string) => void;
}): Promise<{ completionNoteId: string | null }> {
  const photoError = validateReviewPhotos(opts.photos);
  if (photoError) throw new Error(photoError);

  opts.onProgress?.("Saving submission…");

  const res = await fetch(`/api/jobs/${opts.jobId}/review`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: opts.action,
      comments: opts.comment.trim() || null,
      hasPhotos: opts.photos.length > 0,
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error || "Failed to submit review");
  }

  const data = (await res.json()) as { completionNoteId?: string | null };
  const completionNoteId = data.completionNoteId ?? null;

  if (opts.photos.length > 0) {
    if (!completionNoteId) {
      throw new Error("Review saved but photos could not be linked. Please try uploading again from Files.");
    }
    opts.onProgress?.(`Uploading photos 0/${opts.photos.length}…`);
    await uploadReviewPhotos(opts.jobId, opts.photos, completionNoteId, (completed, total) => {
      opts.onProgress?.(`Uploading photos ${completed}/${total}…`);
    });
  }

  opts.onProgress?.("Finishing…");
  return { completionNoteId };
}
