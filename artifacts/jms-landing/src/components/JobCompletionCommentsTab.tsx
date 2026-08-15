import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";
import type { Role } from "@/lib/roles";
import type { JobNoteApi } from "@/components/JobNotesTab";

function roleLabel(role: Role | undefined): string {
  switch (role) {
    case "super-admin":
      return "Super Admin";
    case "admin":
      return "Admin";
    case "supervisor":
      return "Supervisor";
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
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadNotes = useCallback(async () => {
    if (!jobId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/notes`, { credentials: "include" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(data.message || "Failed to load completion comments");
      }
      const data = (await res.json()) as JobNoteApi[];
      const completion = (Array.isArray(data) ? data : []).filter((n) => n.noteType === "completion");
      completion.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setNotes(completion);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load completion comments");
      setNotes([]);
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    void loadNotes();
  }, [loadNotes, refreshKey]);

  return (
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
            Notes added when work is submitted, approved, or completed — shown in order from newest to oldest.
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
            notes.map((note) => (
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
                <p className="text-sm text-gray-800 whitespace-pre-wrap">{stageBody(note.text)}</p>
                <p className="text-[10px] text-gray-400 mt-2">{new Date(note.createdAt).toLocaleString()}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </motion.div>
  );
}
