import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Award, Plus, X, Filter, ChevronRight, Users, Trash2 } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { useDashboardSearch } from "@/lib/pageSearch";
import Pagination, { usePagination } from "@/components/Pagination";
import type { Role } from "@/lib/roles";
import { useAuth } from "@/lib/auth";
import { useListJobs, useListUsers } from "@workspace/api-client-react";
import {
  APPRECIATION_CATEGORIES,
  APPRECIATION_LEVELS,
  formatAppreciationCategory,
  formatAppreciationLevel,
  type AppreciationCategory,
  type AppreciationLevel,
} from "@/lib/appreciationCategories";

type AppreciationRecord = {
  id: string;
  jobId: string | null;
  userId: string;
  title: string;
  description: string;
  category: string;
  level: "good" | "great" | "outstanding" | string;
  createdAt: string;
  jobNumber: string | null;
  jobTitle: string | null;
  jobAddress?: string | null;
  user: { id: string; name: string } | null;
  createdBy: { id: string; name: string } | null;
};

type AppreciationAnalytics = {
  total: number;
  outstanding: number;
  byUser: Array<{ userId: string; name: string; count: number; outstandingCount?: number }>;
  byCategory: Array<{ category: string; count: number }>;
  userProfile?: {
    userId: string;
    name: string;
    total: number;
    outstanding: number;
    byCategory: Array<{ category: string; count: number }>;
  } | null;
};

const FORM_SELECT =
  "w-full mt-1 border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm !text-gray-900 bg-white focus:outline-none focus:border-primary";
const FORM_INPUT =
  "w-full mt-1 border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm !text-gray-900 !placeholder:text-gray-400 bg-white focus:outline-none focus:border-primary";

const LEVEL_STYLE: Record<string, string> = {
  outstanding: "bg-emerald-50 text-emerald-700 border-emerald-200",
  great: "bg-sky-50 text-sky-700 border-sky-200",
  good: "bg-gray-50 text-gray-600 border-gray-200",
};

const jobBaseFor = (role: Role) =>
  role === "super-admin" ? "/super-admin/jobs"
  : role === "admin" ? "/admin/jobs"
  : role === "supervisor" ? "/supervisor/jobs"
  : role === "coordinator" ? "/coordinator/jobs"
  : "/user/jobs";

export default function Appreciations({ role = "super-admin" as Role }: { role?: Role } = {}) {
  const { user: currentUser } = useAuth();
  const { data: apiJobs } = useListJobs();
  const { data: apiUsers } = useListUsers();
  const isWorker = role === "user";
  const canLog = role === "super-admin" || role === "admin";
  const canDelete = role === "super-admin" || role === "admin";

  const [period, setPeriod] = useState("30d");
  const { search, headerSearch } = useDashboardSearch("Search appreciation…");
  const [levelFilter, setLevelFilter] = useState<AppreciationLevel[]>(["good", "great", "outstanding"]);
  const [userFilter, setUserFilter] = useState("");
  const [records, setRecords] = useState<AppreciationRecord[]>([]);
  const [analytics, setAnalytics] = useState<AppreciationAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AppreciationRecord | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    jobId: "",
    userId: "",
    title: "",
    description: "",
    level: "good" as AppreciationLevel,
    category: "other" as AppreciationCategory,
  });

  const jobBase = jobBaseFor(role);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const userQuery = userFilter ? `&userId=${encodeURIComponent(userFilter)}` : "";
        const [listRes, analyticsRes] = await Promise.all([
          fetch(`/api/appreciations?period=${period}${userQuery}`, { credentials: "include" }),
          fetch(`/api/appreciations/analytics?period=${period}${userQuery}`, { credentials: "include" }),
        ]);
        if (!cancelled) {
          if (listRes.ok) setRecords((await listRes.json()) as AppreciationRecord[]);
          if (analyticsRes.ok) setAnalytics((await analyticsRes.json()) as AppreciationAnalytics);
        }
      } catch {
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [period, userFilter]);

  const allWorkers = useMemo(() => {
    return (apiUsers ?? []).filter((u) => u.role === "user");
  }, [apiUsers]);

  const workerOptions = useMemo(() => {
    if (!draft.jobId) return allWorkers;
    const job = (apiJobs ?? []).find((j) => j.id === draft.jobId);
    const assignedIds = new Set(
      [...(job?.assignees ?? []).map((a) => a.id), job?.assignee?.id].filter(
        (id): id is string => Boolean(id),
      ),
    );
    if (assignedIds.size === 0) return [];
    return allWorkers.filter((u) => assignedIds.has(u.id));
  }, [allWorkers, apiJobs, draft.jobId]);

  const selectedUserName = useMemo(() => {
    if (!userFilter) return null;
    return (
      analytics?.userProfile?.name ??
      analytics?.byUser.find((u) => u.userId === userFilter)?.name ??
      allWorkers.find((u) => u.id === userFilter)?.name ??
      "Selected user"
    );
  }, [userFilter, analytics, allWorkers]);

  const jobOptions = useMemo(() => {
    return [...(apiJobs ?? [])].sort((a, b) => {
      const aNum = Number(a.number.replace(/^JOB-/i, "").replace(/\D/g, "")) || 0;
      const bNum = Number(b.number.replace(/^JOB-/i, "").replace(/\D/g, "")) || 0;
      return bNum - aNum;
    });
  }, [apiJobs]);

  const filtered = useMemo(() => {
    return records.filter((r) => {
      if (APPRECIATION_LEVELS.includes(r.level as AppreciationLevel) && !levelFilter.includes(r.level as AppreciationLevel)) {
        return false;
      }
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        r.title.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        (r.user?.name ?? "").toLowerCase().includes(q) ||
        formatAppreciationCategory(r.category).toLowerCase().includes(q) ||
        (r.jobNumber ?? "").toLowerCase().includes(q) ||
        (r.jobTitle ?? "").toLowerCase().includes(q) ||
        (r.jobAddress ?? "").toLowerCase().includes(q)
      );
    });
  }, [records, search, levelFilter]);

  const listP = usePagination(filtered, 8);

  const submitLog = async () => {
    if (!draft.userId || !draft.title.trim() || !draft.description.trim()) return;
    setSaving(true);
    setLogError(null);
    try {
      const res = await fetch("/api/appreciations", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: draft.jobId || null,
          userId: draft.userId,
          title: draft.title.trim(),
          description: draft.description.trim(),
          level: draft.level,
          category: draft.category,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Failed to log appreciation");
      }
      const created = (await res.json()) as AppreciationRecord;
      setRecords((prev) => [created, ...prev]);
      setAnalytics((prev) =>
        prev
          ? {
              ...prev,
              total: prev.total + 1,
              outstanding: prev.outstanding + (created.level === "outstanding" ? 1 : 0),
            }
          : prev,
      );
      setLogOpen(false);
      setLogError(null);
      setDraft({ jobId: "", userId: "", title: "", description: "", level: "good", category: "other" });
    } catch (err) {
      setLogError(err instanceof Error ? err.message : "Failed to log appreciation");
    } finally {
      setSaving(false);
    }
  };

  const acknowledge = async (id: string) => {
    const res = await fetch(`/api/appreciations/${id}/acknowledge`, {
      method: "POST",
      credentials: "include",
    });
    if (res.ok || res.status === 204) setSelected(null);
  };

  const reload = async () => {
    const userQuery = userFilter ? `&userId=${encodeURIComponent(userFilter)}` : "";
    const [listRes, analyticsRes] = await Promise.all([
      fetch(`/api/appreciations?period=${period}${userQuery}`, { credentials: "include" }),
      fetch(`/api/appreciations/analytics?period=${period}${userQuery}`, { credentials: "include" }),
    ]);
    if (listRes.ok) setRecords((await listRes.json()) as AppreciationRecord[]);
    if (analyticsRes.ok) setAnalytics((await analyticsRes.json()) as AppreciationAnalytics);
  };

  const deleteAppreciation = async (id: string) => {
    if (!confirm("Delete this appreciation record? This cannot be undone.")) return;
    const res = await fetch(`/api/appreciations/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) {
      alert("Failed to delete appreciation record.");
      return;
    }
    setSelected(null);
    await reload();
  };

  const toggleLevel = (s: AppreciationLevel) =>
    setLevelFilter((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  return (
    <DashboardLayout title={isWorker ? "My Appreciation" : "Appreciation"} role={role} headerSearch={headerSearch}>
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
          {canLog && (
            <button
              onClick={() => {
                setLogError(null);
                setLogOpen(true);
              }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold shadow-md shadow-emerald-600/30"
            >
              <Plus size={14} /> Log Appreciation
            </button>
          )}
        </div>
      </div>

      {analytics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[
            { label: "Total appreciation", value: analytics.total, sub: "logged records", color: "text-gray-900" },
            { label: "Outstanding", value: analytics.outstanding, sub: "top-level praise", color: "text-emerald-700" },
            {
              label: "Top user",
              value: analytics.byUser[0]?.name ?? "—",
              sub: analytics.byUser[0] ? `${analytics.byUser[0].count} logged` : "no data",
              color: "text-emerald-700",
              userId: analytics.byUser[0]?.userId,
            },
            {
              label: "Top type",
              value: analytics.byCategory[0] ? formatAppreciationCategory(analytics.byCategory[0].category) : "—",
              sub: analytics.byCategory[0] ? `${analytics.byCategory[0].count} times` : "no data",
              color: "text-sky-700",
            },
          ].map((card) => {
            const clickableUserId = "userId" in card ? (card as { userId?: string }).userId : undefined;
            const inner = (
              <>
                <p className="text-[10px] uppercase font-bold text-gray-500">{card.label}</p>
                <p className={`text-lg font-bold truncate ${card.color}`}>{card.value}</p>
                <p className="text-xs text-gray-500">{card.sub}</p>
              </>
            );
            if (clickableUserId) {
              return (
                <button
                  key={card.label}
                  type="button"
                  onClick={() => setUserFilter(clickableUserId)}
                  className="bg-white rounded-2xl border border-gray-100 p-4 text-left hover:border-primary/40 hover:shadow-sm transition-all"
                >
                  {inner}
                </button>
              );
            }
            return (
              <div key={card.label} className="bg-white rounded-2xl border border-gray-100 p-4">
                {inner}
              </div>
            );
          })}
        </div>
      )}

      {!isWorker && analytics && analytics.byUser.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-4">
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <Users size={16} className="text-primary" /> Appreciation by user
            </h4>
            {userFilter && (
              <button
                type="button"
                onClick={() => setUserFilter("")}
                className="text-xs font-semibold text-primary hover:underline"
              >
                Show all users
              </button>
            )}
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
            {analytics.byUser.map((u) => (
              <button
                key={u.userId}
                type="button"
                onClick={() => setUserFilter(u.userId === userFilter ? "" : u.userId)}
                className={`text-left rounded-xl border px-3 py-2.5 transition-colors ${
                  userFilter === u.userId
                    ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                    : "border-gray-100 hover:border-primary/30 hover:bg-gray-50"
                }`}
              >
                <div className="font-semibold text-sm text-gray-900 truncate">{u.name}</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {u.count} record{u.count === 1 ? "" : "s"}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {userFilter && analytics?.userProfile && (
        <div className="bg-emerald-50/60 border border-emerald-100 rounded-2xl p-4 mb-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <p className="text-[10px] uppercase font-bold text-emerald-800 tracking-wide">User record</p>
              <p className="text-lg font-bold text-gray-900">{selectedUserName}</p>
            </div>
            <div className="flex gap-4 text-center">
              <div>
                <div className="text-xl font-bold text-gray-900">{analytics.userProfile.total}</div>
                <div className="text-[10px] text-gray-500 uppercase">Total</div>
              </div>
              <div>
                <div className="text-xl font-bold text-emerald-700">{analytics.userProfile.outstanding}</div>
                <div className="text-[10px] text-gray-500 uppercase">Outstanding</div>
              </div>
            </div>
          </div>
          {analytics.userProfile.byCategory.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {analytics.userProfile.byCategory.map((c) => (
                <span
                  key={c.category}
                  className="text-[11px] font-medium px-2 py-1 rounded-lg bg-white border border-emerald-100 text-gray-700"
                >
                  {formatAppreciationCategory(c.category)} · {c.count}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-4">
        <div className="flex flex-wrap items-center gap-3">
          {!isWorker && (
            <select
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
              className={`text-xs rounded-lg px-3 py-2 ${FORM_SELECT} !mt-0 w-auto min-w-[160px]`}
            >
              <option value="">All users</option>
              {(analytics?.byUser ?? []).map((u) => (
                <option key={u.userId} value={u.userId}>{u.name}</option>
              ))}
            </select>
          )}
          <div className="flex items-center gap-1">
            <Filter size={14} className="text-gray-400" />
            {APPRECIATION_LEVELS.map((s) => (
              <button
                key={s}
                onClick={() => toggleLevel(s)}
                className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase border ${
                  levelFilter.includes(s) ? LEVEL_STYLE[s] : "border-gray-200 text-gray-400"
                }`}
              >
                {formatAppreciationLevel(s)}
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
                No appreciation records match your filters.
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
                <div className={`shrink-0 p-2 rounded-xl border ${LEVEL_STYLE[r.level] ?? LEVEL_STYLE.good}`}>
                  <Award size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm text-gray-900 truncate">{r.title}</span>
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${LEVEL_STYLE[r.level] ?? LEVEL_STYLE.good}`}>
                      {formatAppreciationLevel(r.level)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 truncate mt-0.5">
                    {r.user?.name ?? "Unknown"} · {formatAppreciationCategory(r.category)}
                    {r.jobNumber ? ` · ${r.jobNumber}` : ""}
                    {r.jobTitle ? ` · ${r.jobTitle}` : ""}
                    {r.jobAddress ? ` · ${r.jobAddress}` : ""}
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
                label="appreciation"
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
                    {selected.user?.name} · {formatAppreciationCategory(selected.category)} · {formatAppreciationLevel(selected.level)}
                  </p>
                </div>
                <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600">
                  <X size={18} />
                </button>
              </div>
              <p className="text-sm text-gray-700 mb-4 whitespace-pre-wrap">{selected.description}</p>
              <div className="text-xs text-gray-500 space-y-1 mb-4">
                <div>Logged by: {selected.createdBy?.name ?? "—"}</div>
                <div>Date: {new Date(selected.createdAt).toLocaleString()}</div>
                {selected.jobId && (
                  <>
                    <div>
                      Job:{" "}
                      <Link href={`${jobBase}/${selected.jobId}`} className="text-primary font-semibold hover:underline">
                        {[selected.jobNumber, selected.jobTitle].filter(Boolean).join(" · ") || selected.jobId}
                      </Link>
                    </div>
                    {selected.jobAddress ? <div>Address: {selected.jobAddress}</div> : null}
                  </>
                )}
              </div>
              <div className="flex gap-2 flex-wrap">
                {canDelete && (
                  <button
                    onClick={() => void deleteAppreciation(selected.id)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-red-200 bg-red-50 text-red-700 text-xs font-bold hover:bg-red-100"
                  >
                    <Trash2 size={14} />
                    Delete
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
              <h3 className="font-bold text-gray-900 mb-4">Log Appreciation</h3>
              {logError ? <p className="text-sm text-red-600 mb-3">{logError}</p> : null}
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
                    onChange={(e) => {
                      const jobId = e.target.value;
                      setDraft((d) => {
                        const job = (apiJobs ?? []).find((j) => j.id === jobId);
                        const assignedIds = new Set(
                          [...(job?.assignees ?? []).map((a) => a.id), job?.assignee?.id].filter(
                            (id): id is string => Boolean(id),
                          ),
                        );
                        const userId = jobId && assignedIds.size > 0 && !assignedIds.has(d.userId) ? "" : d.userId;
                        return { ...d, jobId, userId };
                      });
                      setLogError(null);
                    }}
                    className={FORM_SELECT}
                  >
                    <option value="" className="text-gray-500">No job link</option>
                    {jobOptions.map((j) => {
                      const address = (j.address ?? "").trim();
                      return (
                        <option key={j.id} value={j.id}>
                          {j.number} — {j.title}{address ? ` — ${address}` : ""}
                        </option>
                      );
                    })}
                  </select>
                  {draft.jobId && workerOptions.length === 0 ? (
                    <p className="text-xs text-amber-700 mt-1">This job has no assigned workers. Pick a different job or leave job unlinked.</p>
                  ) : null}
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase">Type *</label>
                  <select
                    value={draft.category}
                    onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value as AppreciationCategory }))}
                    className={FORM_SELECT}
                  >
                    {APPRECIATION_CATEGORIES.map((c) => (
                      <option key={c} value={c}>{formatAppreciationCategory(c)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase">Level</label>
                  <select
                    value={draft.level}
                    onChange={(e) => setDraft((d) => ({ ...d, level: e.target.value as AppreciationLevel }))}
                    className={FORM_SELECT}
                  >
                    {APPRECIATION_LEVELS.map((l) => (
                      <option key={l} value={l}>{formatAppreciationLevel(l)}</option>
                    ))}
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
                  <label className="text-xs font-bold text-gray-500 uppercase">Note *</label>
                  <textarea
                    value={draft.description}
                    onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                    rows={3}
                    className={`${FORM_INPUT} resize-none`}
                    placeholder="What they did well"
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
                  className="flex-1 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold disabled:opacity-50"
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
