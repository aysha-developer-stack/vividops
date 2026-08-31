import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";
import type { Role } from "@/lib/roles";
import type { JobNoteApi } from "@/components/JobNotesTab";
import {
  downloadNamedFile,
  jobAttachmentDownloadUrl,
  jobAttachmentPreviewUrl,
} from "@/lib/downloadFile";
import AttachmentPreviewDialog from "@/components/AttachmentPreviewDialog";
import PreviewableImage from "@/components/PreviewableImage";
import { prefetchImagePreview } from "@/lib/attachmentPreview";

type ReviewAttachment = {
  id: string;
  fileName: string;
  fileUrl: string;
  fileType?: string | null;
  reviewNoteId?: string | null;
};

function roleLabel(role: Role | undefined): string {
  switch (role) {
    case "super-admin":
      return "Super Admin";
    case "admin":
      return "Admin";
    case "supervisor":
      return "Supervisor";
    case "coordinator":
      return "Coordinator";
    case "user":
      return "Worker";
    default:
      return role ?? "User";
  }
}

function stageLabel(text: string): string {
  if (text.startsWith("Worker submission:")) return "Worker submission";
  if (text.startsWith("Supervisor review:")) return "Supervisor review";
  if (text.startsWith("Admin completion:")) return "Admin completion";
  return "Completion";
}

function stageBody(text: string): string {
  const prefixes = ["Worker submission:", "Supervisor review:", "Admin completion:"];
  for (const prefix of prefixes) {
    if (text.startsWith(prefix)) return text.slice(prefix.length).trim();
  }
  return text;
}

type Props = {
  jobId: string;
  refreshKey?: number;
};

export default function JobCompletionCommentsTab({ jobId, refreshKey = 0 }: Props) {
  const [notes, setNotes] = useState<JobNoteApi[]>([]);
  const [reviewPhotos, setReviewPhotos] = useState<ReviewAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [previewPhoto, setPreviewPhoto] = useState<ReviewAttachment | null>(null);

  const photosByNoteId = useMemo(() => {
    const map = new Map<string, ReviewAttachment[]>();
    for (const photo of reviewPhotos) {
      if (!photo.reviewNoteId) continue;
      const list = map.get(photo.reviewNoteId) ?? [];
      list.push(photo);
      map.set(photo.reviewNoteId, list);
    }
    return map;
  }, [reviewPhotos]);

  const loadNotes = useCallback(async () => {
    if (!jobId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const [notesRes, attachmentsRes] = await Promise.all([
        fetch(`/api/jobs/${jobId}/notes`, { credentials: "include" }),
        fetch(`/api/jobs/${jobId}/attachments`, { credentials: "include" }),
      ]);
      if (!notesRes.ok) {
        const data = (await notesRes.json().catch(() => ({}))) as { message?: string };
        throw new Error(data.message || "Failed to load completion comments");
      }
      const notesData = (await notesRes.json()) as JobNoteApi[];
      const completion = (Array.isArray(notesData) ? notesData : []).filter((n) => n.noteType === "completion");
      completion.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setNotes(completion);

      if (attachmentsRes.ok) {
        const attachmentsData = (await attachmentsRes.json()) as Array<{
          id: string;
          fileName: string;
          fileUrl: string;
          fileType?: string | null;
          fileCategory?: string | null;
          reviewNoteId?: string | null;
        }>;
        setReviewPhotos(
          (Array.isArray(attachmentsData) ? attachmentsData : [])
            .filter((a) => a.fileCategory === "review")
            .map((a) => ({
              id: a.id,
              fileName: a.fileName,
              fileUrl: a.fileUrl,
              fileType: a.fileType,
              reviewNoteId: a.reviewNoteId ?? null,
            })),
        );
      } else {
        setReviewPhotos([]);
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load completion comments");
      setNotes([]);
      setReviewPhotos([]);
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    void loadNotes();
  }, [loadNotes, refreshKey]);

  const downloadPhoto = (photo: ReviewAttachment) => {
    void downloadNamedFile(jobAttachmentDownloadUrl(jobId, photo.id), photo.fileName).catch(() => {
      window.alert("Download failed. Please try again.");
    });
  };

  return (
    <>
      <motion.div
        key="completion"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -12 }}
        className="space-y-6"
      >
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="p-5 border-b border-gray-100">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 size={18} className="text-emerald-600" />
              <h3 className="font-bold text-gray-900">Completion comments</h3>
            </div>
            <p className="text-xs text-gray-500">
              Notes and photos added when work is submitted, approved, or completed — newest first.
            </p>
          </div>

          <div className="p-5 space-y-4">
            {loading ? (
              <div className="py-10 text-center text-sm text-gray-400">Loading completion comments…</div>
            ) : loadError ? (
              <div className="py-10 text-center text-sm text-red-600">{loadError}</div>
            ) : notes.length === 0 ? (
              <div className="py-10 text-center text-sm text-gray-400">
                No completion comments yet. They appear here when a worker submits, a supervisor approves, or an admin completes the job.
              </div>
            ) : (
              notes.map((note) => {
                const photos = photosByNoteId.get(note.id) ?? [];
                const body = stageBody(note.text);
                return (
                  <div
                    key={note.id}
                    className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className="text-sm font-bold text-gray-900">{note.author?.name ?? "Unknown"}</span>
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border bg-white text-gray-600 border-gray-200">
                        {roleLabel(note.author?.role)}
                      </span>
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border bg-emerald-100 text-emerald-800 border-emerald-200">
                        {stageLabel(note.text)}
                      </span>
                    </div>
                    {body && body !== "(Photos attached)" ? (
                      <p className="text-sm text-gray-800 whitespace-pre-wrap">{body}</p>
                    ) : photos.length > 0 ? (
                      <p className="text-sm text-gray-500 italic">Photos attached</p>
                    ) : null}
                    {photos.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {photos.map((photo) => (
                          <button
                            key={photo.id}
                            type="button"
                            onMouseEnter={() =>
                              prefetchImagePreview(
                                jobAttachmentPreviewUrl(jobId, photo.id),
                                photo.fileName,
                                photo.fileType,
                              )
                            }
                            onClick={() => setPreviewPhoto(photo)}
                            className="block w-24 h-24 rounded-xl overflow-hidden border border-emerald-100 bg-white hover:ring-2 hover:ring-emerald-300 transition-all cursor-pointer"
                            title={photo.fileName}
                          >
                            <PreviewableImage
                              src={jobAttachmentPreviewUrl(jobId, photo.id)}
                              fileName={photo.fileName}
                              fileType={photo.fileType}
                              alt={photo.fileName}
                              className="w-full h-full object-cover"
                              lazy
                              compact
                            />
                          </button>
                        ))}
                      </div>
                    )}
                    <p className="text-[10px] text-gray-400 mt-2">{new Date(note.createdAt).toLocaleString()}</p>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </motion.div>

      {previewPhoto && (
        <AttachmentPreviewDialog
          open={!!previewPhoto}
          onOpenChange={(open) => !open && setPreviewPhoto(null)}
          fileName={previewPhoto.fileName}
          fileType={previewPhoto.fileType}
          previewUrl={jobAttachmentPreviewUrl(jobId, previewPhoto.id)}
          onDownload={() => downloadPhoto(previewPhoto)}
        />
      )}
    </>
  );
}
