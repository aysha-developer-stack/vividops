import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, Plus, X, CheckCircle2 } from "lucide-react";
import type { Role } from "@/lib/roles";
import {
  LOG_MISTAKE_CATEGORIES,
  formatMistakeCategory,
  type MistakeCategory,
} from "@/lib/mistakeCategories";

const FORM_SELECT =
  "w-full mt-1.5 border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm !text-gray-900 bg-white focus:outline-none focus:border-primary";
const FORM_INPUT =
  "w-full mt-1.5 border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm !text-gray-900 !placeholder:text-gray-400 bg-white focus:outline-none focus:border-primary";

const SEV_STYLE: Record<string, string> = {
  high: "bg-red-50 text-red-700 border-red-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  low: "bg-gray-50 text-gray-700 border-gray-200",
};

export type JobMistakeRecord = {
  id: string;
  jobId: string | null;
  userId: string;
  title: string;
  description: string;
  category: string;
  severity: "low" | "medium" | "high";
  status: "open" | "resolved";
  createdAt: string;
  user: { id: string; name: string } | null;
  createdBy: { id: string; name: string } | null;
};

type WorkerOption = { id: string; name: string };

type Props = {
  jobId: string;
  role: Role;
  currentUserId?: string;
  workers: WorkerOption[];
  defaultUserId?: string;
  logRequestToken?: number;
};

export default function JobMistakesTab({
  jobId,
  role,
  currentUserId,
  workers,
  defaultUserId,
  logRequestToken = 0,
}: Props) {
  const canLog = role === "super-admin" || role === "admin";
  const canResolve = role === "super-admin" || role === "admin";
  const isWorker = role === "user";

  const [records, setRecords] = useState<JobMistakeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<JobMistakeRecord | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({
    userId: defaultUserId ?? "",
    title: "",
    description: "",
    severity: "medium" as "low" | "medium" | "high",
    category: "other" as MistakeCategory,
  });

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/mistakes?jobId=${encodeURIComponent(jobId)}&period=all`, {
        credentials: "include",
      });
      if (res.ok) setRecords((await res.json()) as JobMistakeRecord[]);
      else setRecords([]);
    } catch {
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  useEffect(() => {
    if (defaultUserId) setDraft((d) => ({ ...d, userId: defaultUserId }));
  }, [defaultUserId]);

  useEffect(() => {
    if (logRequestToken > 0) setLogOpen(true);
  }, [logRequestToken]);

  const submitLog = async () => {
    if (!draft.userId || !draft.title.trim() || !draft.description.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/mistakes", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          userId: draft.userId,
          title: draft.title.trim(),
          description: draft.description.trim(),
          category: draft.category,
          severity: draft.severity,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Failed to log mistake");
      }
      const created = (await res.json()) as JobMistakeRecord;
      setRecords((prev) => [created, ...prev]);
      setLogOpen(false);
      setDraft({
        userId: defaultUserId ?? "",
        title: "",
        description: "",
        severity: "medium",
        category: "other",
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to log mistake");
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (id: string, status: "open" | "resolved") => {
    const res = await fetch(`/api/mistakes/${id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) return;
    const updated = (await res.json()) as JobMistakeRecord;
    setRecords((prev) => prev.map((r) => (r.id === id ? updated : r)));
    if (selected?.id === id) setSelected(updated);
  };

  const acknowledge = async (id: string) => {
    const res = await fetch(`/api/mistakes/${id}/acknowledge`, {
      method: "POST",
      credentials: "include",
    });
    if (res.ok || res.status === 204) setSelected(null);
  };

  return (
    <motion.div
      key="mistakes-tab"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl border border-gray-100 overflow-hidden"
    >
      <div className="p-5 border-b border-gray-100 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h3 className="font-bold text-gray-900 flex items-center gap-2">
            <AlertTriangle size={18} className="text-red-600" /> Job Mistakes
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Mistake records for this job only — separate from rework workflow
          </p>
        </div>
        {canLog && (
          <button
            type="button"
            onClick={() => setLogOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold shadow-md shadow-primary/30"
          >
            <Plus size={14} /> Log Mistake
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : records.length === 0 ? (
        <div className="text-center py-12 px-4 text-sm text-gray-400">
          No mistakes logged for this job yet.
          {canLog && " Use Log Mistake to record one."}
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {records.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setSelected(r)}
              className="w-full text-left px-5 py-4 hover:bg-gray-50/80 transition-colors flex items-center gap-4"
            >
              <div className={`shrink-0 p-2 rounded-xl border ${SEV_STYLE[r.severity]}`}>
                <AlertTriangle size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm text-gray-900">{r.title}</span>
                  <span
                    className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                      r.status === "open" ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    {r.status}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  {r.user?.name ?? "Unknown"} · {formatMistakeCategory(r.category)} ·{" "}
                  {new Date(r.createdAt).toLocaleString()}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
            onClick={() => setSelected(null)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 max-h-[85vh] overflow-y-auto"
            >
              <div className="flex items-start justify-between mb-4">
                <h3 className="font-bold text-gray-900">{selected.title}</h3>
                <button type="button" onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600">
                  <X size={18} />
                </button>
              </div>
              <p className="text-sm text-gray-700 mb-4 whitespace-pre-wrap">{selected.description}</p>
              <div className="text-xs text-gray-600 space-y-1 mb-4">
                <div>User: <span className="font-semibold text-gray-900">{selected.user?.name ?? "—"}</span></div>
                <div>Type: <span className="font-semibold text-gray-900">{formatMistakeCategory(selected.category)}</span></div>
                <div>Severity: <span className="font-semibold text-gray-900 capitalize">{selected.severity}</span></div>
                <div>Status: <span className="font-semibold text-gray-900 capitalize">{selected.status}</span></div>
                <div>Logged by: {selected.createdBy?.name ?? "—"}</div>
                <div>{new Date(selected.createdAt).toLocaleString()}</div>
              </div>
              <div className="flex gap-2 flex-wrap">
                {canResolve && (
                  <button
                    type="button"
                    onClick={() => updateStatus(selected.id, selected.status === "resolved" ? "open" : "resolved")}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold"
                  >
                    <CheckCircle2 size={14} />
                    Mark {selected.status === "resolved" ? "Open" : "Resolved"}
                  </button>
                )}
                {isWorker && selected.userId === currentUserId && (
                  <button
                    type="button"
                    onClick={() => acknowledge(selected.id)}
                    className="px-4 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-700"
                  >
                    Acknowledge
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {logOpen && canLog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
            onClick={() => setLogOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto"
            >
              <h3 className="font-bold text-gray-900 mb-1">Log Mistake</h3>
              <p className="text-xs text-gray-500 mb-4">Linked to this job · not part of rework</p>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-bold text-gray-600 uppercase">User *</label>
                  <select
                    value={draft.userId}
                    onChange={(e) => setDraft((d) => ({ ...d, userId: e.target.value }))}
                    className={FORM_SELECT}
                  >
                    <option value="" className="text-gray-500">Select user…</option>
                    {workers.map((w) => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-600 uppercase">Mistake type *</label>
                  <select
                    value={draft.category}
                    onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value as MistakeCategory }))}
                    className={FORM_SELECT}
                  >
                    {LOG_MISTAKE_CATEGORIES.map((c) => (
                      <option key={c} value={c}>{formatMistakeCategory(c)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-600 uppercase">Severity</label>
                  <select
                    value={draft.severity}
                    onChange={(e) => setDraft((d) => ({ ...d, severity: e.target.value as typeof draft.severity }))}
                    className={FORM_SELECT}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-600 uppercase">Title *</label>
                  <input
                    value={draft.title}
                    onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                    className={FORM_INPUT}
                    placeholder="Brief summary"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-600 uppercase">Description *</label>
                  <textarea
                    value={draft.description}
                    onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                    rows={3}
                    className={`${FORM_INPUT} resize-none`}
                    placeholder="What happened and why it matters"
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-5">
                <button
                  type="button"
                  onClick={() => setLogOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={saving || !draft.userId || !draft.title.trim() || !draft.description.trim()}
                  onClick={() => void submitLog()}
                  className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
