import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Briefcase, CheckCircle2, ChevronRight, MapPin, X } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { useDashboardSearch } from "@/lib/pageSearch";
import Pagination, { usePagination } from "@/components/Pagination";
import type { Role } from "@/lib/roles";
import { useAuth } from "@/lib/auth";
import { useListUsers } from "@workspace/api-client-react";
import { fetchActiveTimerSessions } from "@/lib/timerSessionApi";

type FreeTimeRecord = {
  id: string;
  userId: string;
  reportDate: string;
  startedAt?: string;
  endedAt?: string | null;
  durationSeconds: number;
  workerNotes: string;
  supervisorNotes: string | null;
  kind?: "free" | "outside_work" | string;
  status: "open" | "detected" | "submitted" | "reviewed" | "outside" | string;
  isOpen?: boolean;
  createdAt: string;
  user: { id: string; name: string } | null;
  createdBy: { id: string; name: string } | null;
  reviewedBy: { id: string; name: string } | null;
};

type PersonCard = {
  id: string;
  name: string;
  status: "free" | "outside" | "on_job" | "none";
  openDuration: number;
  freeSeconds: number;
  pending: number;
  lastDate: string | null;
};

const FORM_INPUT =
  "w-full mt-1.5 border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm !text-gray-900 !placeholder:text-gray-400 bg-white focus:outline-none focus:border-primary";

function formatFreeDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  if (m) return `${m}m`;
  return "0m";
}

function formatDateWithWeekday(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(`${value}T12:00:00+05:00`);
  return Number.isFinite(d.getTime())
    ? d.toLocaleDateString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : value;
}

function formatClock(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Karachi" });
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function isOutside(r: FreeTimeRecord): boolean {
  return r.kind === "outside_work" || r.status === "outside";
}

function entryBadge(r: FreeTimeRecord): { text: string; className: string } {
  if (isOutside(r)) {
    return { text: r.isOpen ? "Outside OPS now" : "Outside OPS", className: "bg-indigo-50 text-indigo-800" };
  }
  if (r.isOpen || r.status === "open") return { text: "Free now", className: "bg-amber-50 text-amber-800" };
  if (r.status === "reviewed") return { text: "Reviewed", className: "bg-emerald-50 text-emerald-700" };
  if (r.status === "submitted") return { text: "Needs supervisor", className: "bg-sky-50 text-sky-800" };
  return { text: "Add notes", className: "bg-orange-50 text-orange-800" };
}

function statusChip(status: PersonCard["status"]): { text: string; className: string } {
  if (status === "free") return { text: "Free now", className: "bg-amber-50 text-amber-800" };
  if (status === "outside") return { text: "Outside OPS", className: "bg-indigo-50 text-indigo-800" };
  if (status === "on_job") return { text: "On OPS job", className: "bg-emerald-50 text-emerald-700" };
  return { text: "No idle now", className: "bg-gray-100 text-gray-600" };
}

export default function FreeTime({ role = "super-admin" }: { role?: Role } = {}) {
  const { user: currentUser } = useAuth();
  const isWorker = role === "user";
  const canFillWorking = role === "super-admin" || role === "admin" || role === "supervisor";
  const { data: apiUsers } = useListUsers({
    query: { enabled: !isWorker },
  });

  const [period, setPeriod] = useState("30d");
  const { search, headerSearch } = useDashboardSearch("Search people…");
  const [records, setRecords] = useState<FreeTimeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [workingIds, setWorkingIds] = useState<Set<string>>(new Set());
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(isWorker ? currentUser?.id ?? null : null);
  const [selected, setSelected] = useState<FreeTimeRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [filling, setFilling] = useState(false);
  const [outsideBusy, setOutsideBusy] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [fillError, setFillError] = useState<string | null>(null);
  const [outsideNote, setOutsideNote] = useState("");
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

  useEffect(() => {
    if (isWorker) return;
    let cancelled = false;
    const load = async () => {
      try {
        const sessions = await fetchActiveTimerSessions();
        if (!cancelled) {
          setWorkingIds(new Set(sessions.filter((s) => s.isLive).map((s) => s.userId)));
        }
      } catch {
        if (!cancelled) setWorkingIds(new Set());
      }
    };
    void load();
    const id = window.setInterval(load, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [isWorker]);

  useEffect(() => {
    if (isWorker && currentUser?.id) setSelectedPersonId(currentUser.id);
  }, [isWorker, currentUser?.id]);

  const people = useMemo((): PersonCard[] => {
    const byUser = new Map<string, PersonCard>();
    const addPerson = (id: string, name: string) => {
      if (!byUser.has(id)) {
        byUser.set(id, {
          id,
          name,
          status: "none",
          openDuration: 0,
          freeSeconds: 0,
          pending: 0,
          lastDate: null,
        });
      }
    };
    for (const u of apiUsers ?? []) {
      if (u.role === "user" && u.status === "active") addPerson(u.id, u.name);
    }
    for (const r of records) {
      const id = r.userId;
      const name = r.user?.name ?? "Unknown";
      addPerson(id, name);
      const row = byUser.get(id)!;
      if (!row.lastDate || r.reportDate > row.lastDate) row.lastDate = r.reportDate;
      if (isOutside(r)) {
        if (r.isOpen || r.status === "open") {
          row.status = "outside";
          row.openDuration = r.durationSeconds;
        }
      } else {
        row.freeSeconds += r.durationSeconds;
        if (r.isOpen || r.status === "open") {
          row.status = "free";
          row.openDuration = r.durationSeconds;
        } else if (r.status !== "reviewed" && r.status !== "outside") {
          row.pending += 1;
        }
      }
    }
    for (const [id, row] of byUser) {
      if (workingIds.has(id)) row.status = "on_job";
    }
    return [...byUser.values()].sort((a, b) => {
      const rank = { free: 0, outside: 1, on_job: 2, none: 3 };
      const d = rank[a.status] - rank[b.status];
      if (d !== 0) return d;
      return a.name.localeCompare(b.name);
    });
  }, [apiUsers, records, workingIds]);

  const filteredPeople = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return people;
    return people.filter((p) => p.name.toLowerCase().includes(q));
  }, [people, search]);

  const listP = usePagination(filteredPeople, 12);
  const selectedPerson = people.find((p) => p.id === selectedPersonId) ?? null;
  const personRecords = useMemo(() => {
    if (!selectedPersonId) return [];
    return records
      .filter((r) => r.userId === selectedPersonId)
      .sort((a, b) => {
        if (a.reportDate !== b.reportDate) return a.reportDate < b.reportDate ? 1 : -1;
        return (a.startedAt ?? a.createdAt).localeCompare(b.startedAt ?? b.createdAt);
      });
  }, [records, selectedPersonId]);

  const historyByDay = useMemo(() => {
    const groups: Array<{ date: string; items: FreeTimeRecord[] }> = [];
    const index = new Map<string, FreeTimeRecord[]>();
    for (const r of personRecords) {
      let items = index.get(r.reportDate);
      if (!items) {
        items = [];
        index.set(r.reportDate, items);
        groups.push({ date: r.reportDate, items });
      }
      items.push(r);
    }
    return groups;
  }, [personRecords]);

  const freeNowCount = people.filter((p) => p.status === "free").length;
  const outsideNowCount = people.filter((p) => p.status === "outside").length;
  const awaitingFill = people.reduce((sum, p) => sum + p.pending, 0);
  const myOpen = records.find((r) => r.userId === currentUser?.id && (r.isOpen || r.status === "open"));
  const myOutside = myOpen && isOutside(myOpen);
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
      await loadRecords(true);
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
      await loadRecords(true);
    } catch (err) {
      setFillError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setFilling(false);
    }
  };

  const markOutside = async (record: FreeTimeRecord, outside: boolean) => {
    setFilling(true);
    setFillError(null);
    try {
      const res = await fetch(`/api/free-time/${record.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: outside ? "outside_work" : "free" }),
      });
      const data = (await res.json().catch(() => ({}))) as FreeTimeRecord & { error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to save");
      setSelected(data.id ? data : { ...record, kind: outside ? "outside_work" : "free" });
      await loadRecords(true);
    } catch (err) {
      setFillError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setFilling(false);
    }
  };

  const toggleOutsideWork = async (active: boolean) => {
    setOutsideBusy(true);
    try {
      const res = await fetch("/api/free-time/outside-work", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active, note: outsideNote.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to update");
      setOutsideNote("");
      await loadRecords(true);
    } catch (err) {
      setNoteError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setOutsideBusy(false);
    }
  };

  const showPeople = !isWorker && !selectedPersonId;

  return (
    <DashboardLayout title={isWorker ? "My Free Time" : "Free Time"} role={role} headerSearch={headerSearch}>
      <p className="text-sm text-gray-600 mb-5">
        {isWorker
          ? "Idle time is detected when you are in Vivid OPS with no job timer. If you are working on a job that is not in OPS, tap Working outside OPS so it is not counted as free."
          : "Each person has their own record. Open a name to see every free day, with the weekday. If they were on a job that is not in Vivid OPS, mark it as outside OPS so it is not treated as idle."}
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

      {isWorker && (
        <div className={`rounded-2xl border p-4 mb-6 ${myOutside ? "bg-indigo-50 border-indigo-100" : "bg-amber-50 border-amber-100"}`}>
          {myOutside ? (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <div className="text-sm font-bold text-indigo-950">Working outside OPS</div>
                <p className="text-xs text-indigo-800 mt-0.5">
                  This time is not counted as free. {myOpen ? formatFreeDuration(myOpen.durationSeconds) : ""} so far.
                </p>
              </div>
              <button
                type="button"
                disabled={outsideBusy}
                onClick={() => void toggleOutsideWork(false)}
                className="px-4 py-2 rounded-xl bg-indigo-700 text-white text-xs font-bold disabled:opacity-50"
              >
                {outsideBusy ? "Saving…" : "Finished outside work"}
              </button>
            </div>
          ) : (
            <div>
              <div className="text-sm font-bold text-amber-950 mb-1">On a job that is not in Vivid OPS?</div>
              <p className="text-xs text-amber-800 mb-3">
                Start this so the system does not treat you as idle while you work outside OPS.
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  value={outsideNote}
                  onChange={(e) => setOutsideNote(e.target.value)}
                  className={`${FORM_INPUT} !mt-0`}
                  placeholder="Optional: which job / site…"
                />
                <button
                  type="button"
                  disabled={outsideBusy}
                  onClick={() => void toggleOutsideWork(true)}
                  className="shrink-0 px-4 py-2.5 rounded-xl bg-indigo-700 text-white text-xs font-bold disabled:opacity-50"
                >
                  {outsideBusy ? "Saving…" : "Working outside OPS"}
                </button>
              </div>
              {noteError ? <p className="text-xs text-red-600 mt-2">{noteError}</p> : null}
            </div>
          )}
        </div>
      )}

      {!isWorker && showPeople && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <p className="text-[10px] uppercase font-bold text-gray-500">Free now</p>
            <p className="text-2xl font-bold text-amber-700">{freeNowCount}</p>
            <p className="text-xs text-gray-500">Online, no job timer</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <p className="text-[10px] uppercase font-bold text-gray-500">Outside OPS now</p>
            <p className="text-2xl font-bold text-indigo-700">{outsideNowCount}</p>
            <p className="text-xs text-gray-500">Working a job not in OPS</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <p className="text-[10px] uppercase font-bold text-gray-500">Waiting for supervisor</p>
            <p className="text-2xl font-bold text-sky-700">{awaitingFill}</p>
            <p className="text-xs text-gray-500">idle stretches need notes</p>
          </div>
        </div>
      )}

      {showPeople ? (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          {loading ? (
            <div className="p-10 text-center text-sm text-gray-400">Loading…</div>
          ) : filteredPeople.length === 0 ? (
            <div className="p-10 text-center text-sm text-gray-400">No people in this period.</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {listP.pageItems.map((p) => {
                const chip = statusChip(p.status);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedPersonId(p.id)}
                    className="w-full text-left px-5 py-4 hover:bg-gray-50/80 transition-colors flex items-center gap-3"
                  >
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-sky-700 text-white text-xs font-bold flex items-center justify-center shrink-0">
                      {initials(p.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold text-gray-900 truncate">{p.name}</div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {p.status === "free" || p.status === "outside"
                          ? `${formatFreeDuration(p.openDuration)} and counting`
                          : p.lastDate
                            ? `Last record ${formatDateWithWeekday(p.lastDate)}`
                            : "No free-time records yet"}
                        {p.freeSeconds > 0 ? ` · ${formatFreeDuration(p.freeSeconds)} idle in period` : ""}
                        {p.pending > 0 ? ` · ${p.pending} need review` : ""}
                      </p>
                    </div>
                    <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-lg ${chip.className}`}>
                      {chip.text}
                    </span>
                    <ChevronRight size={16} className="text-gray-300 shrink-0" />
                  </button>
                );
              })}
            </div>
          )}
          {filteredPeople.length > 0 && (
            <div className="px-4 py-3 border-t border-gray-100">
              <Pagination
                page={listP.page}
                totalPages={listP.totalPages}
                total={listP.total}
                pageSize={listP.pageSize}
                onChange={listP.setPage}
                label="people"
              />
            </div>
          )}
        </div>
      ) : (
        <div>
          {!isWorker && (
            <button
              type="button"
              onClick={() => setSelectedPersonId(null)}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-600 hover:text-gray-900 mb-4"
            >
              <ArrowLeft size={14} /> All people
            </button>
          )}
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">{selectedPerson?.name ?? currentUser?.name ?? "History"}</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Chronological free-time history · date and weekday on every day
              </p>
            </div>
            {loading ? (
              <div className="p-10 text-center text-sm text-gray-400">Loading…</div>
            ) : historyByDay.length === 0 ? (
              <div className="p-10 text-center text-sm text-gray-400">
                No free-time or outside-OPS records in this period.
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {historyByDay.map((group) => (
                  <section key={group.date} className="px-5 py-4">
                    <h3 className="text-sm font-bold text-gray-900 mb-3">{formatDateWithWeekday(group.date)}</h3>
                    <div className="space-y-2">
                      {group.items.map((r) => {
                        const badge = entryBadge(r);
                        const start = formatClock(r.startedAt);
                        const end = r.isOpen ? "now" : formatClock(r.endedAt) || "—";
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
                            className="w-full text-left rounded-xl border border-gray-100 px-4 py-3 hover:border-primary/40 hover:bg-gray-50/80 transition-colors"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-xs text-gray-500">
                                  {start && end ? `${start} – ${end}` : ""} · {formatFreeDuration(r.durationSeconds)}
                                  {r.isOpen ? " and counting" : ""}
                                </p>
                                <p className="text-sm text-gray-800 mt-1 line-clamp-2">
                                  {isOutside(r)
                                    ? r.workerNotes?.trim() || "Working outside Vivid OPS"
                                    : r.workerNotes?.trim() || "No notes yet — system detected this idle time."}
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
                  </section>
                ))}
              </div>
            )}
          </div>
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
              className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="font-bold text-gray-900">{selected.user?.name ?? "Person"}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {formatDateWithWeekday(selected.reportDate)}
                    {formatClock(selected.startedAt) ? ` · ${formatClock(selected.startedAt)}` : ""}
                    {selected.isOpen ? " – now" : formatClock(selected.endedAt) ? ` – ${formatClock(selected.endedAt)}` : ""}
                    {` · ${formatFreeDuration(selected.durationSeconds)}`}
                  </p>
                </div>
                <button type="button" onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600">
                  <X size={18} />
                </button>
              </div>

              {canFillWorking && (
                <div className="mb-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={filling || !isOutside(selected)}
                    onClick={() => void markOutside(selected, false)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wide ${
                      !isOutside(selected) ? "bg-amber-50 text-amber-800" : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    <Briefcase size={12} /> Idle / free
                  </button>
                  <button
                    type="button"
                    disabled={filling || isOutside(selected)}
                    onClick={() => void markOutside(selected, true)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wide ${
                      isOutside(selected) ? "bg-indigo-50 text-indigo-800" : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    <MapPin size={12} /> Worked outside OPS
                  </button>
                </div>
              )}

              {canEditWorkerNotes ? (
                <div className="mb-4">
                  <label className="text-xs font-bold text-gray-600 uppercase">
                    {isOutside(selected) ? "Outside job / what I was doing" : "What I did / learned"}
                  </label>
                  <textarea
                    value={workerNotes}
                    onChange={(e) => setWorkerNotes(e.target.value)}
                    rows={4}
                    className={`${FORM_INPUT} resize-none`}
                    placeholder={isOutside(selected) ? "Which site or builder job…" : "Practice, training, waiting on files…"}
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
                  <div className="text-[10px] font-bold uppercase tracking-wide text-gray-500 mb-1">
                    {isOutside(selected) ? "Outside job" : "What they did / learned"}
                  </div>
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
              {canFillWorking && !isOutside(selected) && (
                <div>
                  <label className="text-xs font-bold text-gray-600 uppercase">What they did during this time</label>
                  <textarea
                    value={supervisorNotes}
                    onChange={(e) => setSupervisorNotes(e.target.value)}
                    rows={4}
                    className={`${FORM_INPUT} resize-none`}
                    placeholder="Supervisor fills: what happened while they were free…"
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
              {fillError && isOutside(selected) ? <p className="text-xs text-red-600 mt-1">{fillError}</p> : null}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </DashboardLayout>
  );
}
