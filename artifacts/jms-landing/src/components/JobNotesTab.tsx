import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Pin, PinOff, Pencil, Trash2, Send, StickyNote, Paperclip, X } from "lucide-react";
import type { Role } from "@/lib/roles";
import { JOB_FILE_ACCEPT } from "@/lib/collectDroppedFiles";
import { uploadJobAttachmentsBatch } from "@/lib/uploadJobAttachmentsBatch";
import {
  downloadNamedFile,
  jobAttachmentDownloadUrl,
  jobAttachmentPreviewUrl,
} from "@/lib/downloadFile";
import { isPreviewableImageAttachment, prefetchImagePreview } from "@/lib/attachmentPreview";
import AttachmentPreviewDialog from "@/components/AttachmentPreviewDialog";
import PreviewableImage from "@/components/PreviewableImage";
import LocalPreviewImage from "@/components/LocalPreviewImage";
import FileExtensionIcon from "@/components/FileExtensionIcon";

export type JobNoteApi = {
  id: string;
  jobId: string;
  userId: string;
  text: string;
  noteType: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  author: { id: string; name: string; role: Role } | null;
};

type NoteAttachment = {
  id: string;
  fileName: string;
  fileUrl: string;
  fileType?: string | null;
  reviewNoteId?: string | null;
};

const ATTACHMENT_PLACEHOLDER = "(Files attached)";

const NOTE_TYPE_OPTIONS: Array<{ value: string; label: string; hint?: string }> = [
  { value: "general", label: "General" },
  { value: "site", label: "Site update" },
  { value: "client", label: "Client instruction" },
  { value: "internal", label: "Internal only", hint: "Hidden from field workers" },
];

function noteTypeLabel(value: string): string {
  return NOTE_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

function noteTypeBadgeClass(value: string): string {
  switch (value) {
    case "site":
      return "bg-sky-50 text-sky-700 border-sky-200";
    case "client":
      return "bg-violet-50 text-violet-700 border-violet-200";
    case "internal":
      return "bg-amber-50 text-amber-800 border-amber-200";
    default:
      return "bg-gray-50 text-gray-700 border-gray-200";
  }
}

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

function isNotePlaceholderText(text: string): boolean {
  return text === ATTACHMENT_PLACEHOLDER || text === "(Photos attached)";
}

type Props = {
  jobId: string;
  role: Role;
  currentUserId?: string;
  /** Bump to reload notes after server-side completion comments are saved. */
  refreshKey?: number;
};

export default function JobNotesTab({ jobId, role, currentUserId, refreshKey = 0 }: Props) {
  const isAdmin = role === "super-admin" || role === "admin";
  const canSetInternal = isAdmin || role === "supervisor" || role === "coordinator";
  const canPin = isAdmin || role === "supervisor" || role === "coordinator";

  const [notes, setNotes] = useState<JobNoteApi[]>([]);
  const [noteAttachments, setNoteAttachments] = useState<NoteAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [noteType, setNoteType] = useState("general");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [posting, setPosting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [editType, setEditType] = useState("general");
  const [savingEdit, setSavingEdit] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState<NoteAttachment | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const attachmentsByNoteId = useMemo(() => {
    const map = new Map<string, NoteAttachment[]>();
    for (const att of noteAttachments) {
      if (!att.reviewNoteId) continue;
      const list = map.get(att.reviewNoteId) ?? [];
      list.push(att);
      map.set(att.reviewNoteId, list);
    }
    return map;
  }, [noteAttachments]);

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
        throw new Error(data.message || "Failed to load notes");
      }
      const data = (await notesRes.json()) as JobNoteApi[];
      setNotes(Array.isArray(data) ? data : []);

      if (attachmentsRes.ok) {
        const attachmentsData = (await attachmentsRes.json()) as Array<{
          id: string;
          fileName: string;
          fileUrl: string;
          fileType?: string | null;
          fileCategory?: string | null;
          reviewNoteId?: string | null;
        }>;
        setNoteAttachments(
          (Array.isArray(attachmentsData) ? attachmentsData : [])
            .filter((a) => a.fileCategory === "note")
            .map((a) => ({
              id: a.id,
              fileName: a.fileName,
              fileUrl: a.fileUrl,
              fileType: a.fileType,
              reviewNoteId: a.reviewNoteId ?? null,
            })),
        );
      } else {
        setNoteAttachments([]);
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load notes");
      setNotes([]);
      setNoteAttachments([]);
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    void loadNotes();
  }, [loadNotes, refreshKey]);

  const canModify = (note: JobNoteApi) => isAdmin || note.userId === currentUserId;
  const jobNotesOnly = notes.filter((n) => n.noteType !== "completion");

  const addPendingFiles = (files: FileList | File[]) => {
    const next = Array.from(files);
    if (next.length === 0) return;
    setPendingFiles((prev) => [...prev, ...next]);
  };

  const removePendingFile = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const canPost = draft.trim().length > 0 || pendingFiles.length > 0;

  const postNote = async () => {
    const text = draft.trim();
    const files = pendingFiles;
    if ((!text && files.length === 0) || !jobId) return;

    setPosting(true);
    setUploadProgress(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/notes`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: text || undefined,
          noteType,
          hasAttachments: files.length > 0,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(data.message || "Failed to post note");
      }
      const created = (await res.json()) as JobNoteApi;

      if (files.length > 0) {
        setUploadProgress(`Uploading 0/${files.length}…`);
        await uploadJobAttachmentsBatch(
          jobId,
          files.map((file) => ({
            file,
            fileCategory: "note",
            reviewNoteId: created.id,
          })),
          {
            suppressNotifications: true,
            onProgress: (completed, total) => {
              setUploadProgress(`Uploading ${completed}/${total}…`);
            },
          },
        );
      }

      await loadNotes();
      setDraft("");
      setNoteType("general");
      setPendingFiles([]);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Failed to post note");
    } finally {
      setPosting(false);
      setUploadProgress(null);
    }
  };

  const startEdit = (note: JobNoteApi) => {
    setEditingId(note.id);
    setEditDraft(isNotePlaceholderText(note.text) ? "" : note.text);
    setEditType(note.noteType);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft("");
    setEditType("general");
  };

  const saveEdit = async (noteId: string) => {
    const text = editDraft.trim();
    const attachments = attachmentsByNoteId.get(noteId) ?? [];
    if (!text && attachments.length === 0) return;
    if (!jobId) return;
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/notes/${noteId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: text || ATTACHMENT_PLACEHOLDER,
          noteType: editType,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(data.message || "Failed to update note");
      }
      const updated = (await res.json()) as JobNoteApi;
      setNotes((prev) => prev.map((n) => (n.id === noteId ? updated : n)));
      cancelEdit();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Failed to update note");
    } finally {
      setSavingEdit(false);
    }
  };

  const deleteNote = async (note: JobNoteApi) => {
    if (!window.confirm("Delete this note? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/jobs/${jobId}/notes/${note.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(data.message || "Failed to delete note");
      }
      setNotes((prev) => prev.filter((n) => n.id !== note.id));
      setNoteAttachments((prev) => prev.filter((a) => a.reviewNoteId !== note.id));
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Failed to delete note");
    }
  };

  const togglePin = async (note: JobNoteApi) => {
    try {
      const res = await fetch(`/api/jobs/${jobId}/notes/${note.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned: !note.pinned }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(data.message || "Failed to update pin");
      }
      const updated = (await res.json()) as JobNoteApi;
      setNotes((prev) => {
        const next = prev.map((n) => (n.id === note.id ? updated : n));
        return next.sort((a, b) => {
          if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
      });
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Failed to update pin");
    }
  };

  const downloadAttachment = (att: NoteAttachment) => {
    void downloadNamedFile(jobAttachmentDownloadUrl(jobId, att.id), att.fileName).catch(() => {
      window.alert("Download failed. Please try again.");
    });
  };

  const pinnedNotes = jobNotesOnly.filter((n) => n.pinned);
  const regularNotes = [...jobNotesOnly.filter((n) => !n.pinned)].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  const renderAttachments = (noteId: string) => {
    const attachments = attachmentsByNoteId.get(noteId) ?? [];
    if (attachments.length === 0) return null;

    return (
      <div className="flex flex-wrap gap-2 mt-3">
        {attachments.map((att) => {
          const isImage = isPreviewableImageAttachment(att.fileName, att.fileType);
          if (isImage) {
            return (
              <button
                key={att.id}
                type="button"
                onMouseEnter={() =>
                  prefetchImagePreview(
                    jobAttachmentPreviewUrl(jobId, att.id),
                    att.fileName,
                    att.fileType,
                  )
                }
                onClick={() => setPreviewAttachment(att)}
                className="block h-20 w-20 overflow-hidden rounded-lg border border-gray-200 bg-white hover:ring-2 hover:ring-primary/30"
              >
                <PreviewableImage
                  src={jobAttachmentPreviewUrl(jobId, att.id)}
                  fileName={att.fileName}
                  fileType={att.fileType}
                  alt={att.fileName}
                  className="h-full w-full object-cover"
                  lazy
                  compact
                />
              </button>
            );
          }
          return (
            <button
              key={att.id}
              type="button"
              onClick={() => downloadAttachment(att)}
              className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-left hover:bg-gray-50 max-w-[220px]"
            >
              <FileExtensionIcon fileName={att.fileName} size="lg" />
              <span className="text-xs font-medium text-gray-800 truncate">{att.fileName}</span>
            </button>
          );
        })}
      </div>
    );
  };

  const renderNote = (note: JobNoteApi, isOwn?: boolean) => {
    const isEditing = editingId === note.id;
    const attachments = attachmentsByNoteId.get(note.id) ?? [];
    const showText = !isNotePlaceholderText(note.text) || attachments.length === 0;

    return (
      <div
        key={note.id}
        className={`rounded-xl border p-4 ${
          note.pinned
            ? "border-primary/30 bg-primary/5"
            : isOwn
              ? "border-primary/20 bg-primary/5 ml-4 sm:ml-8"
              : "border-gray-100 bg-gray-50/40 mr-4 sm:mr-8"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <span className="text-sm font-bold text-gray-900">{note.author?.name ?? "Unknown"}</span>
              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border bg-white text-gray-600 border-gray-200">
                {roleLabel(note.author?.role)}
              </span>
              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${noteTypeBadgeClass(note.noteType)}`}>
                {noteTypeLabel(note.noteType)}
              </span>
              {note.pinned && (
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border bg-primary/10 text-primary border-primary/20">
                  Pinned
                </span>
              )}
            </div>
            {isEditing ? (
              <div className="space-y-2">
                {canSetInternal && (
                  <select
                    value={editType}
                    onChange={(e) => setEditType(e.target.value)}
                    className="w-full max-w-xs bg-white !text-gray-900 border-2 border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-primary"
                  >
                    {NOTE_TYPE_OPTIONS.filter((o) => o.value !== "internal" || canSetInternal).map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                )}
                <textarea
                  value={editDraft}
                  onChange={(e) => setEditDraft(e.target.value)}
                  rows={4}
                  placeholder="Edit note text…"
                  className="w-full bg-white border-2 border-gray-200 rounded-xl p-3 text-sm !text-gray-900 focus:outline-none focus:border-primary resize-none"
                />
                {attachments.length > 0 && (
                  <p className="text-xs text-gray-500">Attachments stay linked to this note.</p>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={savingEdit || (!editDraft.trim() && attachments.length === 0)}
                    onClick={() => void saveEdit(note.id)}
                    className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-semibold disabled:opacity-50"
                  >
                    {savingEdit ? "Saving…" : "Save"}
                  </button>
                  <button type="button" onClick={cancelEdit} className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                {showText ? (
                  <p className="text-sm text-gray-800 whitespace-pre-wrap">{note.text}</p>
                ) : attachments.length > 0 ? (
                  <p className="text-sm text-gray-500 italic">Files attached</p>
                ) : null}
                {renderAttachments(note.id)}
              </>
            )}
            <p className="text-[10px] text-gray-400 mt-2">
              {new Date(note.createdAt).toLocaleString()}
              {note.updatedAt !== note.createdAt ? " · edited" : ""}
            </p>
          </div>
          {!isEditing && canModify(note) && (
            <div className="flex items-center gap-1 shrink-0">
              {canPin && (
                <button
                  type="button"
                  onClick={() => void togglePin(note)}
                  className="p-2 text-gray-400 hover:text-primary hover:bg-primary/5 rounded-lg transition-colors"
                  title={note.pinned ? "Unpin" : "Pin"}
                >
                  {note.pinned ? <PinOff size={14} /> : <Pin size={14} />}
                </button>
              )}
              <button
                type="button"
                onClick={() => startEdit(note)}
                className="p-2 text-gray-400 hover:text-primary hover:bg-primary/5 rounded-lg transition-colors"
                title="Edit"
              >
                <Pencil size={14} />
              </button>
              <button
                type="button"
                onClick={() => void deleteNote(note)}
                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                title="Delete"
              >
                <Trash2 size={14} />
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      <motion.div
        key="notes"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -12 }}
        className="space-y-6"
      >
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden flex flex-col">
          <div className="p-5 border-b border-gray-100">
            <div className="flex items-center gap-2 mb-1">
              <StickyNote size={18} className="text-primary" />
              <h3 className="font-bold text-gray-900">Job notes</h3>
            </div>
            <p className="text-xs text-gray-500">
              Write a note, attach images or files, or both — like a chat thread for this job.
              {isAdmin ? " As admin you can edit, delete, and pin any note." : ""}
            </p>
          </div>

          <div className="p-5 space-y-4 min-h-[200px] flex-1">
            {loading ? (
              <div className="py-10 text-center text-sm text-gray-400">Loading notes…</div>
            ) : loadError ? (
              <div className="py-10 text-center text-sm text-red-600">{loadError}</div>
            ) : jobNotesOnly.length === 0 ? (
              <div className="py-10 text-center text-sm text-gray-400">No notes yet. Be the first to add one.</div>
            ) : (
              <>
                {pinnedNotes.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-primary">Pinned</p>
                    {pinnedNotes.map((n) => renderNote(n, n.userId === currentUserId))}
                  </div>
                )}
                {regularNotes.length > 0 && (
                  <div className="space-y-3">
                    {pinnedNotes.length > 0 && (
                      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">All notes</p>
                    )}
                    {regularNotes.map((n) => renderNote(n, n.userId === currentUserId))}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="p-5 border-t border-gray-100 bg-gray-50/50">
            <label className="text-xs font-semibold text-gray-700 mb-2 block">Add a note</label>
            <div className="flex flex-col sm:flex-row gap-2 mb-3">
              <select
                value={noteType}
                onChange={(e) => setNoteType(e.target.value)}
                className="sm:w-44 bg-white !text-gray-900 border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
              >
                {NOTE_TYPE_OPTIONS.filter((o) => o.value !== "internal" || canSetInternal).map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              placeholder="Type a message… add photos or files with the attach button"
              className="w-full bg-white border-2 border-gray-200 rounded-xl p-3 text-sm !text-gray-900 !placeholder:text-gray-400 focus:outline-none focus:border-primary resize-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canPost && !posting) {
                  e.preventDefault();
                  void postNote();
                }
              }}
            />

            {pendingFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {pendingFiles.map((file, index) => {
                  const isImage = isPreviewableImageAttachment(file.name, file.type);
                  return (
                    <div
                      key={`${file.name}-${index}`}
                      className="relative flex items-center gap-2 rounded-lg border border-gray-200 bg-white p-2 pr-8 max-w-[200px]"
                    >
                      {isImage ? (
                        <LocalPreviewImage file={file} alt={file.name} className="h-10 w-10 rounded object-cover shrink-0" />
                      ) : (
                        <FileExtensionIcon fileName={file.name} size="lg" />
                      )}
                      <span className="text-xs text-gray-700 truncate">{file.name}</span>
                      <button
                        type="button"
                        onClick={() => removePendingFile(index)}
                        className="absolute top-1 right-1 p-1 text-gray-400 hover:text-red-600 rounded"
                        title="Remove"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={JOB_FILE_ACCEPT}
              className="hidden"
              onChange={(e) => {
                if (e.target.files) addPendingFiles(e.target.files);
                e.target.value = "";
              }}
            />

            <div className="flex items-center justify-between mt-3 gap-2">
              <button
                type="button"
                disabled={posting}
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                <Paperclip size={14} />
                Attach files
              </button>
              <div className="flex items-center gap-3">
                {uploadProgress ? (
                  <span className="text-xs text-gray-500">{uploadProgress}</span>
                ) : null}
                <button
                  type="button"
                  disabled={posting || !canPost}
                  onClick={() => void postNote()}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-xs font-semibold hover:bg-primary/90 disabled:opacity-50"
                >
                  <Send size={14} />
                  {posting ? "Sending…" : "Send"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {previewAttachment ? (
        <AttachmentPreviewDialog
          open={!!previewAttachment}
          onOpenChange={(open) => {
            if (!open) setPreviewAttachment(null);
          }}
          fileName={previewAttachment.fileName}
          fileType={previewAttachment.fileType}
          previewUrl={jobAttachmentPreviewUrl(jobId, previewAttachment.id)}
          onDownload={() => downloadAttachment(previewAttachment)}
        />
      ) : null}
    </>
  );
}
