import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle, Plus, Search, X, CheckCircle2, Filter, ChevronRight,
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import Pagination, { usePagination } from "@/components/Pagination";
import type { Role } from "@/lib/roles";
import { useAuth } from "@/lib/auth";
import { useListJobs, useListUsers } from "@workspace/api-client-react";
import {
  LOG_MISTAKE_CATEGORIES,
  formatMistakeCategory,
  type MistakeCategory,
} from "@/lib/mistakeCategories";

type MistakeRecord = {
  id: string;
  jobId: string | null;
  userId: string;
  title: string;
  description: string;
  category: string;
  severity: "low" | "medium" | "high";
  status: "open" | "resolved";
  createdAt: string;
  jobNumber: string | null;
  jobTitle: string | null;
  user: { id: string; name: string } | null;
  createdBy: { id: string; name: string } | null;
};

type MistakeAnalytics = {
  total: number;
  open: number;
  highSeverity: number;
  byUser: Array<{ userId: string; name: string; count: number; openCount: number }>;
  byCategory: Array<{ category: string; count: number }>;
};

const FORM_SELECT =
  "w-full mt-1 border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm !text-gray-900 bg-white focus:outline-none focus:border-primary";
const FORM_INPUT =
  "w-full mt-1 border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm !text-gray-900 !placeholder:text-gray-400 bg-white focus:outline-none focus:border-primary";

const SEV_STYLE: Record<string, string> = {
  high: "bg-red-50 text-red-700 border-red-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  low: "bg-gray-50 text-gray-600 border-gray-200",
};

const jobBaseFor = (role: Role) =>
  role === "super-admin" ? "/super-admin/jobs"
  : role === "admin" ? "/admin/jobs"
  : role === "supervisor" ? "/supervisor/jobs"
  : "/user/jobs";

export default function Mistakes({ role = "super-admin" as Role }: { role?: Role } = {}) {
  const { user: currentUser } = useAuth();
  const { data: apiJobs } = useListJobs();
  const { data: apiUsers } = useListUsers();
  const isWorker = role === "user";
  const canLog = role === "super-admin" || role === "admin";
  const canResolve = role === "super-admin" || role === "admin";

  const [period, setPeriod] = useState("30d");
  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState<("high" | "medium" | "low")[]>(["high", "medium", "low"]);
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "resolved">("all");
  const [records, setRecords] = useState<MistakeRecord[]>([]);
  const [analytics, setAnalytics] = useState<MistakeAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<MistakeRecord | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({
    jobId: "",
    userId: "",
    title: "",
    description: "",
    severity: "medium" as "low" | "medium" | "high",
    category: "other" as MistakeCategory,
  });

  const jobBase = jobBaseFor(role);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [listRes, analyticsRes] = await Promise.all([
          fetch(`/api/mistakes?period=${period}`, { credentials: "include" }),
          fetch(`/api/mistakes/analytics?period=${period}`, { credentials: "include" }),
        ]);
        if (!cancelled) {
          if (listRes.ok) setRecords((await listRes.json()) as MistakeRecord[]);
          if (analyticsRes.ok) setAnalytics((await analyticsRes.json()) as MistakeAnalytics);
        }
      } catch {
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [period]);

  const workerOptions = useMemo(() => {
    return (apiUsers ?? []).filter((u) => u.role === "user");
  }, [apiUsers]);

  const jobOptions = useMemo(() => apiJobs ?? [], [apiJobs]);

  const filtered = useMemo(() => {
    return records.filter((r) => {
      if (!severityFilter.includes(r.severity)) return false;
      if (statusFilter === "open" && r.status !== "open") return false;
      if (statusFilter === "resolved" && r.status !== "resolved") return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        r.title.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        (r.user?.name ?? "").toLowerCase().includes(q) ||
        formatMistakeCategory(r.category).toLowerCase().includes(q) ||
        (r.jobNumber ?? "").toLowerCase().includes(q)
      );
    });
  }, [records, search, severityFilter, statusFilter]);

  const listP = usePagination(filtered, 8);

  const submitLog = async () => {
    if (!draft.userId || !draft.title.trim() || !draft.description.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/mistakes", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: draft.jobId || null,
          userId: draft.userId,
          title: draft.title.trim(),
          description: draft.description.trim(),
          severity: draft.severity,
          category: draft.category,
        }),
      });
      if (!res.ok) return;
      const created = (await res.json()) as MistakeRecord;
      setRecords((prev) => [created, ...prev]);
      setAnalytics((prev) =>
        prev
          ? {
              ...prev,
              total: prev.total + 1,
              open: prev.open + 1,
              highSeverity: prev.highSeverity + (created.severity === "high" ? 1 : 0),
            }
          : prev,
      );
      setLogOpen(false);
      setDraft({ jobId: "", userId: "", title: "", description: "", severity: "medium", category: "other" });
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
    const updated = (await res.json()) as MistakeRecord;
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

  const toggleSeverity = (s: "high" | "medium" | "low") =>
    setSeverityFilter((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  return (
    <DashboardLayout title={isWorker ? "My Mistakes" : "Mistakes"} role={role}>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div>
          <p className="text-sm text-gray-500">
            {isWorker
              ? "Mistake records logged by your supervisor or admin. Separate from job rework."
              : canLog
                ? "Track user mistakes for training and accountability. Not linked to rework workflow."
                : "View mistake records for your team. Only admin can log new mistakes."}
          </p>
        </div>
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
          {canLog && (
            <button
              onClick={() => setLogOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold shadow-md shadow-primary/30"
            >
              <Plus size={14} /> Log Mistake
            </button>
          )}
        </div>
      </div>

      {analytics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[
            { label: "Total mistakes", value: analytics.total, sub: `${analytics.open} open`, color: "text-gray-900" },
            { label: "High severity", value: analytics.highSeverity, sub: "needs attention", color: "text-red-600" },
            {
              label: "Top user",
              value: analytics.byUser[0]?.name ?? "—",
              sub: analytics.byUser[0] ? `${analytics.byUser[0].count} mistakes` : "no data",
              color: "text-amber-700",
            },
            {
              label: "Top type",
              value: analytics.byCategory[0] ? formatMistakeCategory(analytics.byCategory[0].category) : "—",
              sub: analytics.byCategory[0] ? `${analytics.byCategory[0].count} times` : "no data",
              color: "text-purple-700",
            },
          ].map((card) => (
            <div key={card.label} className="bg-white rounded-2xl border border-gray-100 p-4">
              <p className="text-[10px] uppercase font-bold text-gray-500">{card.label}</p>
              <p className={`text-lg font-bold truncate ${card.color}`}>{card.value}</p>
              <p className="text-xs text-gray-500">{card.sub}</p>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-[200px] bg-gray-50 rounded-xl px-3 py-2">
            <Search size={14} className="text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search user, type, job…"
              className="bg-transparent text-sm flex-1 focus:outline-none text-gray-900 placeholder:text-gray-400"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className={`text-xs rounded-lg px-3 py-2 ${FORM_SELECT} !mt-0 w-auto min-w-[120px]`}
          >
            <option value="all">All status</option>
            <option value="open">Open</option>
            <option value="resolved">Resolved</option>
          </select>
          <div className="flex items-center gap-1">
            <Filter size={14} className="text-gray-400" />
            {(["high", "medium", "low"] as const).map((s) => (
              <button
                key={s}
                onClick={() => toggleSeverity(s)}
                className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase border ${
                  severityFilter.includes(s) ? SEV_STYLE[s] : "border-gray-200 text-gray-400"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {listP.pageItems.length === 0 && (
              <div className="text-center py-12 text-sm text-gray-400 bg-white rounded-2xl border border-gray-100">
                No mistake records match your filters.
              </div>
            )}
            {listP.pageItems.map((r, i) => (
              <motion.button
                key={r.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                onClick={() => setSelected(r)}
                className="w-full text-left bg-white rounded-2xl border border-gray-100 p-4 hover:border-primary/30 hover:shadow-sm transition-all flex items-center gap-4"
              >
                <div className={`shrink-0 p-2 rounded-xl border ${SEV_STYLE[r.severity]}`}>
                  <AlertTriangle size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm text-gray-900 truncate">{r.title}</span>
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                      r.status === "open" ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"
                    }`}>
                      {r.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 truncate mt-0.5">
                    {r.user?.name ?? "Unknown"} · {formatMistakeCategory(r.category)}
                    {r.jobNumber ? ` · ${r.jobNumber}` : ""}
                    {" · "}{new Date(r.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <ChevronRight size={16} className="text-gray-300 shrink-0" />
              </motion.button>
            ))}
          </div>
          {filtered.length > 0 && (
            <div className="mt-4 bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <Pagination
                page={listP.page}
                totalPages={listP.totalPages}
                total={listP.total}
                pageSize={listP.pageSize}
                onChange={listP.setPage}
                label="mistakes"
              />
            </div>
          )}
        </>
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
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 max-h-[85vh] overflow-y-auto"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="font-bold text-gray-900">{selected.title}</h3>
                  <p className="text-xs text-gray-500 mt-1">
                    {selected.user?.name} · {formatMistakeCategory(selected.category)} · {selected.severity}
                  </p>
                </div>
                <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600">
                  <X size={18} />
                </button>
              </div>
              <p className="text-sm text-gray-700 mb-4 whitespace-pre-wrap">{selected.description}</p>
              <div className="text-xs text-gray-500 space-y-1 mb-4">
                <div>Status: <span className="font-semibold text-gray-800">{selected.status}</span></div>
                <div>Logged by: {selected.createdBy?.name ?? "—"}</div>
                <div>Date: {new Date(selected.createdAt).toLocaleString()}</div>
                {selected.jobId && (
                  <div>
                    Job:{" "}
                    <Link href={`${jobBase}/${selected.jobId}`} className="text-primary font-semibold hover:underline">
                      {selected.jobNumber ?? selected.jobTitle ?? selected.jobId}
                    </Link>
                  </div>
                )}
              </div>
              <div className="flex gap-2 flex-wrap">
                {canResolve && (
                  <button
                    onClick={() => updateStatus(selected.id, selected.status === "resolved" ? "open" : "resolved")}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold"
                  >
                    <CheckCircle2 size={14} />
                    Mark {selected.status === "resolved" ? "Open" : "Resolved"}
                  </button>
                )}
                {isWorker && selected.userId === currentUser?.id && (
                  <button
                    onClick={() => acknowledge(selected.id)}
                    className="px-4 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 hover:border-primary"
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
              className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6"
            >
              <h3 className="font-bold text-gray-900 mb-4">Log Mistake</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase">User *</label>
                  <select
                    value={draft.userId}
                    onChange={(e) => setDraft((d) => ({ ...d, userId: e.target.value }))}
                    className={FORM_SELECT}
                  >
                    <option value="" className="text-gray-500">Select user…</option>
                    {workerOptions.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase">Job (optional)</label>
                  <select
                    value={draft.jobId}
                    onChange={(e) => setDraft((d) => ({ ...d, jobId: e.target.value }))}
                    className={FORM_SELECT}
                  >
                    <option value="" className="text-gray-500">No job link</option>
                    {jobOptions.map((j) => (
                      <option key={j.id} value={j.id}>{j.number} — {j.title}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase">Mistake type *</label>
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
                  <label className="text-xs font-bold text-gray-500 uppercase">Severity</label>
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
                  <label className="text-xs font-bold text-gray-500 uppercase">Title *</label>
                  <input
                    value={draft.title}
                    onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                    className={FORM_INPUT}
                    placeholder="Brief summary"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase">Description *</label>
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
                  onClick={() => setLogOpen(false)}
                  className="flex-1 py-2 rounded-xl border border-gray-200 text-sm font-bold text-gray-600"
                >
                  Cancel
                </button>
                <button
                  disabled={saving || !draft.userId || !draft.title.trim() || !draft.description.trim()}
                  onClick={() => void submitLog()}
                  className="flex-1 py-2 rounded-xl bg-primary text-white text-sm font-bold disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </DashboardLayout>
  );
}
