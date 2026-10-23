import { uploadJobAttachmentsBatch } from "@/lib/uploadJobAttachmentsBatch";

const NOTE_TEXT_MAX = 5000;

type CreatedNote = { id?: string };

/** Save create-job instructions as a pinned worker-visible note (text + files). */
export async function postJobCreateInstructions(
  jobId: string,
  text: string,
  files: File[],
): Promise<void> {
  const trimmed = text.trim().slice(0, NOTE_TEXT_MAX);
  if (!trimmed && files.length === 0) return;

  const res = await fetch(`/api/jobs/${jobId}/notes`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: trimmed || undefined,
      noteType: "client",
      pinned: true,
      hasAttachments: files.length > 0,
    }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(data.message || "Failed to save job instructions");
  }

  const created = (await res.json()) as CreatedNote;
  if (files.length === 0 || !created.id) return;

  await uploadJobAttachmentsBatch(
    jobId,
    files.map((file) => ({
      file,
      fileCategory: "note",
      reviewNoteId: created.id,
    })),
    { suppressNotifications: true },
  );
}
