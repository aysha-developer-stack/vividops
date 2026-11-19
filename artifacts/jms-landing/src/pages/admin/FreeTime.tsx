import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, CheckCircle2 } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { useDashboardSearch } from "@/lib/pageSearch";
import Pagination, { usePagination } from "@/components/Pagination";
import type { Role } from "@/lib/roles";
import { useAuth } from "@/lib/auth";

type FreeTimeRecord = {
  id: string;
  userId: string;
  reportDate: string;
  startedAt?: string;
  endedAt?: string | null;
  durationSeconds: number;
  workerNotes: string;
  supervisorNotes: string | null;
  status: "open" | "detected" | "submitted" | "reviewed" | string;
  isOpen?: boolean;
  createdAt: string;
  user: { id: string; name: string } | null;
  createdBy: { id: string; name: string } | null;
  reviewedBy: { id: string; name: string } | null;
};

const FORM_INPUT =
  "w-full mt-1.5 border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm !text-gray-900 !placeholder:text-gray-400 bg-white focus:outline-none focus:border-primary";

function formatFreeDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

function formatReportDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(`${value}T12:00:00+05:00`);
  return Number.isFinite(d.getTime())
    ? d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    : value;
}

function statusLabel(r: FreeTimeRecord): { text: string; className: string } {
  if (r.isOpen || r.status === "open") return { text: "Free now", className: "bg-amber-50 text-amber-800" };
  if (r.status === "reviewed") return { text: "Reviewed", className: "bg-emerald-50 text-emerald-700" };
  if (r.status === "submitted") return { text: "Needs supervisor", className: "bg-sky-50 text-sky-800" };
  return { text: "Add notes", className: "bg-orange-50 text-orange-800" };
}

export default function FreeTime({ role = "super-admin" }: { role?: Role } = {}) {
  const { user: currentUser } = useAuth();
  const isWorker = role === "user";
  const canFillWorking = role === "super-admin" || role === "admin" || role === "supervisor";

  const [period, setPeriod] = useState("30d");
  const { search, headerSearch } = useDashboardSearch("Search free time…");
  const [records, setRecords] = useState<FreeTimeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<FreeTimeRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [filling, setFilling] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [fillError, setFillError] = useState<string | null>(null);
  const [supervisorNotes, setSupervisorNotes] = useState("");
  const [workerNotes, setWorkerNotes] = useState("");

  const loadRecords = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`/api/free-time?period=${period}`, { credentials: "include" });
      if (res.ok) setRecords((await res.json()) as FreeTimeRecord[]);
      else setRecords([]);
    } catch {
      setRecords([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    void loadRecords(false);
    const id = window.setInterval(() => void loadRecords(true), 30_000);
    return () => window.clearInterval(id);
  }, [loadRecords]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return records;
    return records.filter((r) => {
      return (
        (r.user?.name ?? "").toLowerCase().includes(q) ||
        (r.workerNotes ?? "").toLowerCase().includes(q) ||
        (r.supervisorNotes ?? "").toLowerCase().includes(q) ||
        r.reportDate.includes(q)
      );
    });
  }, [records, search]);

  const listP = usePagination(filtered, 10);
  const freeNow = records.filter((r) => r.isOpen || r.status === "open");
  const awaitingFill = records.filter((r) => r.status !== "reviewed" && !r.isOpen && r.status !== "open").length;
  const canEditWorkerNotes =
    !!selected && (isWorker ? selected.userId === currentUser?.id : canFillWorking);

  const saveWorkerNotes = async () => {
    if (!selected || !workerNotes.trim()) return;
    setSaving(true);
    setNoteError(null);
    try {
      const res = await fetch(`/api/free-time/${selected.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workerNotes: workerNotes.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as FreeTimeRecord & { error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to save");
      setSelected(data.id ? data : { ...selected, workerNotes: workerNotes.trim() });
      await loadRecords();
    } catch (err) {
      setNoteError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const saveWorkingNotes = async () => {
    if (!selected || !supervisorNotes.trim()) return;
    setFilling(true);
    setFillError(null);
    try {
      const res = await fetch(`/api/free-time/${selected.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supervisorNotes: supervisorNotes.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as FreeTimeRecord & { error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to save");
      setSelected(data.id ? data : { ...selected, supervisorNotes: supervisorNotes.trim(), status: "reviewed" });
      await loadRecords();
    } catch (err) {
      setFillError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setFilling(false);
    }
  };

  return (
    <DashboardLayout title={isWorker ? "My Free Time" : "Free Time"} role={role} headerSearch={headerSearch}>
      <p className="text-sm text-gray-600 mb-5">
        {isWorker
          ? "Vivid OPS detects when you are online and not on a job timer. You only add what you did or learned."
          : "Vivid OPS detects workers who are online with no running job timer. You fill what they did during that time."}
      </p>
      <div className="flex flex-col md:flex-row md:items-center md:justify-end gap-4 mb-6">
        <div className="flex items-center gap-2 flex-wrap">
          {(["7d", "30d", "90d", "all"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                period === p ? "bg-primary text-white" : "bg-white border border-gray-200 text-gray-600 hover:border-primary"
              }`}
            >
              {p === "all" ? "All time" : p.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {!isWorker && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <p className="text-[10px] uppercase font-bold text-gray-500">Free now</p>
            <p className="text-2xl font-bold text-amber-700">{freeNow.length}</p>
            <p className="text-xs text-gray-500">Online, no job timer</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <p className="text-[10px] uppercase font-bold text-gray-500">Detected periods</p>
            <p className="text-2xl font-bold text-gray-900">{records.length}</p>
            <p className="text-xs text-gray-500">in this period</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <p className="text-[10px] uppercase font-bold text-gray-500">Waiting for supervisor</p>
            <p className="text-2xl font-bold text-sky-700">{awaitingFill}</p>
            <p className="text-xs text-gray-500">need working notes</p>
          </div>
        </div>
      )}

      {!isWorker && freeNow.length > 0 && (
        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 mb-6">
          <div className="text-xs font-bold text-amber-900 mb-2">Currently free</div>
          <div className="flex flex-wrap gap-2">
            {freeNow.slice(0, 24).map((p) => (
              <span key={p.id} className="px-2.5 py-1 rounded-lg bg-white border border-amber-100 text-xs font-semibold text-gray-800">
                {p.user?.name ?? "Unknown"} · {formatFreeDuration(p.durationSeconds)}
              </span>
            ))}
            {freeNow.length > 24 ? <span className="text-xs text-amber-800">+{freeNow.length - 24} more</span> : null}
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-sm text-gray-400">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-400">
            {isWorker
              ? "No free time detected yet. When you are in Vivid OPS without a job timer, it will show up here."
              : "No free time detected in this period."}
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {listP.pageItems.map((r) => {
              const badge = statusLabel(r);
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => {
                    setSelected(r);
                    setSupervisorNotes(r.supervisorNotes ?? "");
                    setWorkerNotes(r.workerNotes ?? "");
                    setFillError(null);
                    setNoteError(null);
                  }}
                  className="w-full text-left px-5 py-4 hover:bg-gray-50/80 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-gray-900 truncate">{r.user?.name ?? "Unknown"}</div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {formatReportDate(r.reportDate)} · {formatFreeDuration(r.durationSeconds)}
                        {r.isOpen || r.status === "open" ? " and counting" : ""}
                      </p>
                      <p className="text-sm text-gray-700 mt-1.5 line-clamp-2">
                        {r.workerNotes?.trim() ? r.workerNotes : "No notes yet — system detected this idle time."}
                      </p>
                    </div>
                    <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-lg ${badge.className}`}>
                      {badge.text}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
        {filtered.length > 0 && (
          <div className="px-4 py-3 border-t border-gray-100">
            <Pagination
              page={listP.page}
              totalPages={listP.totalPages}
              total={listP.total}
              pageSize={listP.pageSize}
              onChange={listP.setPage}
              label="periods"
            />
          </div>
        )}
      </div>

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
              className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="font-bold text-gray-900">{selected.user?.name ?? "Person"}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {formatReportDate(selected.reportDate)} · {formatFreeDuration(selected.durationSeconds)}
                    {selected.isOpen || selected.status === "open" ? " (still free)" : ""}
                  </p>
                </div>
                <button type="button" onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600">
                  <X size={18} />
                </button>
              </div>

              {canEditWorkerNotes ? (
                <div className="mb-4">
                  <label className="text-xs font-bold text-gray-600 uppercase">What I did / learned</label>
                  <textarea
                    value={workerNotes}
                    onChange={(e) => setWorkerNotes(e.target.value)}
                    rows={4}
                    className={`${FORM_INPUT} resize-none`}
                    placeholder="Practice, training, helping someone, waiting on files…"
                  />
                  {noteError ? <p className="text-xs text-red-600 mt-1">{noteError}</p> : null}
                  <button
                    type="button"
                    disabled={saving || !workerNotes.trim()}
                    onClick={() => void saveWorkerNotes()}
                    className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gray-900 text-white text-xs font-bold disabled:opacity-50"
                  >
                    {saving ? "Saving…" : "Save notes"}
                  </button>
                </div>
              ) : (
                <div className="mb-4">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-gray-500 mb-1">What they did / learned</div>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap">
                    {selected.workerNotes?.trim() || "No notes yet."}
                  </p>
                </div>
              )}

              {selected.supervisorNotes && (
                <div className="mb-4 rounded-xl bg-sky-50 border border-sky-100 p-3">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-sky-800 mb-1">
                    Supervisor working notes{selected.reviewedBy?.name ? ` · ${selected.reviewedBy.name}` : ""}
                  </div>
                  <p className="text-sm text-sky-950 whitespace-pre-wrap">{selected.supervisorNotes}</p>
                </div>
              )}
              {canFillWorking && (
                <div>
                  <label className="text-xs font-bold text-gray-600 uppercase">What they did during this time</label>
                  <textarea
                    value={supervisorNotes}
                    onChange={(e) => setSupervisorNotes(e.target.value)}
                    rows={4}
                    className={`${FORM_INPUT} resize-none`}
                    placeholder="Supervisor fills: what work, practice, or learning happened while they were free…"
                  />
                  {fillError ? <p className="text-xs text-red-600 mt-1">{fillError}</p> : null}
                  <button
                    type="button"
                    disabled={filling || !supervisorNotes.trim()}
                    onClick={() => void saveWorkingNotes()}
                    className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold disabled:opacity-50"
                  >
                    <CheckCircle2 size={14} />
                    {filling ? "Saving…" : "Save working notes"}
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </DashboardLayout>
  );
}
