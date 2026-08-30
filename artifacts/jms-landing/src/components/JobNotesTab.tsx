import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Pin, PinOff, Pencil, Trash2, Send, StickyNote } from "lucide-react";
import type { Role } from "@/lib/roles";

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
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [noteType, setNoteType] = useState("general");
  const [posting, setPosting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [editType, setEditType] = useState("general");
  const [savingEdit, setSavingEdit] = useState(false);

  const loadNotes = useCallback(async () => {
    if (!jobId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/notes`, { credentials: "include" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(data.message || "Failed to load notes");
      }
      const data = (await res.json()) as JobNoteApi[];
      setNotes(Array.isArray(data) ? data : []);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load notes");
      setNotes([]);
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    void loadNotes();
  }, [loadNotes, refreshKey]);

  const canModify = (note: JobNoteApi) => isAdmin || note.userId === currentUserId;
  const jobNotesOnly = notes.filter((n) => n.noteType !== "completion");

  const postNote = async () => {
    const text = draft.trim();
    if (!text || !jobId) return;
    setPosting(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/notes`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, noteType }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(data.message || "Failed to post note");
      }
      const created = (await res.json()) as JobNoteApi;
      setNotes((prev) => [created, ...prev.filter((n) => n.id !== created.id)]);
      setDraft("");
      setNoteType("general");
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Failed to post note");
    } finally {
      setPosting(false);
    }
  };

  const startEdit = (note: JobNoteApi) => {
    setEditingId(note.id);
    setEditDraft(note.text);
    setEditType(note.noteType);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft("");
    setEditType("general");
  };

  const saveEdit = async (noteId: string) => {
    const text = editDraft.trim();
    if (!text || !jobId) return;
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/notes/${noteId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, noteType: editType }),
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

  const pinnedNotes = jobNotesOnly.filter((n) => n.pinned);
  const regularNotes = jobNotesOnly.filter((n) => !n.pinned);

  const renderNote = (note: JobNoteApi) => {
    const isEditing = editingId === note.id;
    return (
      <div
        key={note.id}
        className={`rounded-xl border p-4 ${note.pinned ? "border-primary/30 bg-primary/5" : "border-gray-100 bg-gray-50/40"}`}
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
                  className="w-full bg-white border-2 border-gray-200 rounded-xl p-3 text-sm !text-gray-900 focus:outline-none focus:border-primary resize-none"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={savingEdit || !editDraft.trim()}
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
              <p className="text-sm text-gray-800 whitespace-pre-wrap">{note.text}</p>
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
    <motion.div
      key="notes"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      className="space-y-6"
    >
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="p-5 border-b border-gray-100">
          <div className="flex items-center gap-2 mb-1">
            <StickyNote size={18} className="text-primary" />
            <h3 className="font-bold text-gray-900">Job notes</h3>
          </div>
          <p className="text-xs text-gray-500">
            Permanent record for this job — site updates, client instructions, and handover notes.
            {isAdmin ? " As admin you can edit, delete, and pin any note." : ""}
          </p>
        </div>

        <div className="p-5 border-b border-gray-100 bg-gray-50/50">
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
            placeholder="e.g. Client requested garage shifted 200mm east…"
            className="w-full bg-white border-2 border-gray-200 rounded-xl p-3 text-sm !text-gray-900 !placeholder:text-gray-400 focus:outline-none focus:border-primary resize-none"
          />
          <div className="flex justify-end mt-3">
            <button
              type="button"
              disabled={posting || !draft.trim()}
              onClick={() => void postNote()}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-xs font-semibold hover:bg-primary/90 disabled:opacity-50"
            >
              <Send size={14} />
              {posting ? "Posting…" : "Post note"}
            </button>
          </div>
        </div>

        <div className="p-5 space-y-4">
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
                  {pinnedNotes.map(renderNote)}
                </div>
              )}
              {regularNotes.length > 0 && (
                <div className="space-y-3">
                  {pinnedNotes.length > 0 && (
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">All notes</p>
                  )}
                  {regularNotes.map(renderNote)}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}
