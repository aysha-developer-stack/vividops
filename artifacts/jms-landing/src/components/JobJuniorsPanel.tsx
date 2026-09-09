import { useCallback, useEffect, useState } from "react";
import { GraduationCap, Loader2, Pause, Play, Plus, Trash2 } from "lucide-react";
import {
  addJobJunior,
  deleteJobJunior,
  fetchJobJuniors,
  liveJuniorElapsedSeconds,
  toggleJuniorTimer,
  updateJobJunior,
  type JobJunior,
  type JobJuniorStatus,
} from "@/lib/jobJuniorsApi";

function formatTime(s: number) {
  const n = Math.max(0, Math.floor(s));
  return `${String(Math.floor(n / 3600)).padStart(2, "0")}:${String(Math.floor((n % 3600) / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const second = parts[1]?.[0] ?? parts[0]?.[1] ?? "";
  return `${first}${second}`.toUpperCase();
}

function hoursToSeconds(hours: string, minutes: string): number {
  const h = Number(hours);
  const m = Number(minutes);
  const hourPart = Number.isFinite(h) && h > 0 ? h : 0;
  const minutePart = Number.isFinite(m) && m > 0 ? m : 0;
  return Math.round(hourPart * 3600 + minutePart * 60);
}

export default function JobJuniorsPanel({
  jobId,
  canEdit,
}: {
  jobId: string;
  canEdit: boolean;
}) {
  const [juniors, setJuniors] = useState<JobJunior[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [addHours, setAddHours] = useState<Record<string, { h: string; m: string }>>({});

  const load = useCallback(async () => {
    try {
      const rows = await fetchJobJuniors(jobId);
      setJuniors(rows);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load juniors");
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => void load(), 20_000);
    return () => window.clearInterval(id);
  }, [load]);

  const anyRunning = juniors.some((j) => j.running);
  useEffect(() => {
    if (!anyRunning) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [anyRunning]);

  const totalSeconds = juniors.reduce((sum, j) => sum + liveJuniorElapsedSeconds(j, nowMs), 0);

  const run = async (id: string, fn: () => Promise<void>) => {
    setBusyId(id);
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusyId(null);
    }
  };

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    await run("new", async () => {
      await addJobJunior(jobId, { name });
      setNewName("");
    });
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 lg:p-6">
      <div className="flex items-start justify-between gap-3 mb-1">
        <h3 className="font-bold text-gray-900 flex items-center gap-2">
          <GraduationCap size={16} className="text-primary" />
          Junior trainees
        </h3>
        {juniors.length > 0 && (
          <div className="text-xs text-gray-500">
            Total junior time{" "}
            <span className="font-mono font-semibold text-gray-800 tabular-nums">{formatTime(totalSeconds)}</span>
          </div>
        )}
      </div>
      <p className="text-xs text-gray-500 mb-4">
        Juniors are not system users. The worker on this job records their name, status, and hours. This time stays
        separate from the worker's logged time.
      </p>

      {error && (
        <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-gray-400 py-6 justify-center">
          <Loader2 size={14} className="animate-spin" /> Loading juniors...
        </div>
      ) : juniors.length === 0 && !canEdit ? (
        <div className="text-xs text-gray-400 py-6 text-center">No junior trainees recorded on this job</div>
      ) : (
        <div className="space-y-3">
          {juniors.map((junior) => {
            const elapsed = liveJuniorElapsedSeconds(junior, nowMs);
            const hoursDraft = addHours[junior.id] ?? { h: "", m: "" };
            const busy = busyId === junior.id;
            return (
              <div
                key={junior.id}
                className="rounded-xl border border-gray-100 bg-gray-50/70 p-3 sm:p-4"
              >
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 text-white text-xs font-bold flex items-center justify-center shrink-0">
                    {initialsOf(junior.name)}
                  </div>
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {canEdit ? (
                        <input
                          defaultValue={junior.name}
                          onBlur={(e) => {
                            const name = e.target.value.trim();
                            if (!name || name === junior.name) return;
                            void run(junior.id, () => updateJobJunior(jobId, junior.id, { name }).then(() => undefined));
                          }}
                          className="min-w-[10rem] flex-1 px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-sm font-semibold text-gray-900"
                        />
                      ) : (
                        <div className="text-sm font-semibold text-gray-900">{junior.name}</div>
                      )}
                      {canEdit ? (
                        <select
                          value={junior.status}
                          disabled={busy}
                          onChange={(e) => {
                            const status = e.target.value as JobJuniorStatus;
                            void run(junior.id, () => updateJobJunior(jobId, junior.id, { status }).then(() => undefined));
                          }}
                          className="px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-semibold text-gray-700"
                        >
                          <option value="not_started">Not started</option>
                          <option value="in_progress">In progress</option>
                        </select>
                      ) : (
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                            junior.status === "in_progress"
                              ? "bg-sky-100 text-sky-800"
                              : "bg-gray-200 text-gray-600"
                          }`}
                        >
                          {junior.status === "in_progress" ? "In progress" : "Not started"}
                        </span>
                      )}
                      <div className="ml-auto flex items-center gap-2 font-mono text-base font-bold text-gray-900 tabular-nums">
                        {formatTime(elapsed)}
                        {junior.running && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />}
                      </div>
                    </div>

                    {canEdit && (
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void run(junior.id, () =>
                              toggleJuniorTimer(jobId, junior.id, junior.running ? "pause" : "start").then(() => undefined),
                            )
                          }
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold ${
                            junior.running
                              ? "bg-amber-100 text-amber-800 hover:bg-amber-200"
                              : "bg-emerald-600 text-white hover:bg-emerald-700"
                          } disabled:opacity-50`}
                        >
                          {junior.running ? <Pause size={12} /> : <Play size={12} />}
                          {junior.running ? "Pause" : "Start timer"}
                        </button>
                        <input
                          type="number"
                          min="0"
                          step="0.25"
                          placeholder="Hours"
                          value={hoursDraft.h}
                          onChange={(e) =>
                            setAddHours((prev) => ({ ...prev, [junior.id]: { ...hoursDraft, h: e.target.value } }))
                          }
                          className="w-20 px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-xs"
                        />
                        <input
                          type="number"
                          min="0"
                          max="59"
                          step="1"
                          placeholder="Mins"
                          value={hoursDraft.m}
                          onChange={(e) =>
                            setAddHours((prev) => ({ ...prev, [junior.id]: { ...hoursDraft, m: e.target.value } }))
                          }
                          className="w-16 px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-xs"
                        />
                        <button
                          type="button"
                          disabled={busy || hoursToSeconds(hoursDraft.h, hoursDraft.m) <= 0}
                          onClick={() => {
                            const addSeconds = hoursToSeconds(hoursDraft.h, hoursDraft.m);
                            if (addSeconds <= 0) return;
                            void run(junior.id, async () => {
                              await updateJobJunior(jobId, junior.id, { addSeconds });
                              setAddHours((prev) => ({ ...prev, [junior.id]: { h: "", m: "" } }));
                            });
                          }}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                          Add hours
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            if (!window.confirm(`Remove ${junior.name} from this job?`)) return;
                            void run(junior.id, () => deleteJobJunior(jobId, junior.id));
                          }}
                          className="ml-auto p-1.5 text-gray-400 hover:text-rose-600 rounded-lg"
                          title="Remove junior"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}

                    {junior.addedByName && (
                      <div className="text-[10px] text-gray-400">Recorded by {junior.addedByName}</div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {canEdit && (
        <form
          className="mt-4 flex flex-col sm:flex-row gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void handleAdd();
          }}
        >
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Junior name"
            className="flex-1 px-3 py-2 bg-gray-50 border-2 border-gray-200 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-primary focus:bg-white"
          />
          <button
            type="submit"
            disabled={!newName.trim() || busyId === "new"}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-primary text-white disabled:opacity-50"
          >
            {busyId === "new" ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Add junior
          </button>
        </form>
      )}
    </div>
  );
}
