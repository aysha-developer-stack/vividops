import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Clock, AlertCircle, TrendingUp, Plus, X, Activity, FileWarning,
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import Pagination, { usePagination } from "@/components/Pagination";

interface Worker {
  id: number;
  name: string;
  avatar: string;
  hoursToday: number;
  hoursWeek: number;
  jobsCompleted: number;
  errors: number;
  efficiency: number;
  status: "active" | "idle" | "offline";
  lastJob: string;
}

const WORKERS: Worker[] = [
  { id: 1, name: "Riley Adams", avatar: "RA", hoursToday: 6.5, hoursWeek: 32.4, jobsCompleted: 14, errors: 0, efficiency: 96, status: "active", lastJob: "JOB-2148" },
  { id: 2, name: "Olivia Carter", avatar: "OC", hoursToday: 5.2, hoursWeek: 28.8, jobsCompleted: 11, errors: 1, efficiency: 88, status: "active", lastJob: "JOB-2150" },
  { id: 3, name: "Lisa Martinez", avatar: "LM", hoursToday: 7.8, hoursWeek: 38.1, jobsCompleted: 16, errors: 2, efficiency: 82, status: "idle", lastJob: "JOB-2147" },
  { id: 4, name: "James Bennett", avatar: "JB", hoursToday: 3.1, hoursWeek: 22.6, jobsCompleted: 9, errors: 0, efficiency: 94, status: "active", lastJob: "JOB-2151" },
  { id: 5, name: "David Wilson", avatar: "DW", hoursToday: 0, hoursWeek: 18.4, jobsCompleted: 6, errors: 3, efficiency: 71, status: "offline", lastJob: "JOB-2144" },
];

interface ErrorReport { id: number; user: string; job: string; desc: string; severity: string; date: string; }
const SEED_ERRORS: ErrorReport[] = [
  { id: 1, user: "Lisa Martinez", job: "JOB-2147", desc: "Incorrect footing dimensions recorded during inspection", severity: "Medium", date: "Today" },
  { id: 2, user: "David Wilson", job: "JOB-2144", desc: "Missed checklist step #4 (subfloor moisture check)", severity: "Low", date: "Yesterday" },
  { id: 3, user: "Olivia Carter", job: "JOB-2150", desc: "Late arrival to client site", severity: "Low", date: "2d ago" },
];

const SEVERITY: Record<string, string> = {
  High: "bg-red-50 text-red-700 border-red-200",
  Medium: "bg-amber-50 text-amber-700 border-amber-200",
  Low: "bg-blue-50 text-blue-700 border-blue-200",
};

export default function UserMonitoring() {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"performance" | "errors">("performance");
  const [errorModal, setErrorModal] = useState(false);
  const [errors, setErrors] = useState<ErrorReport[]>(SEED_ERRORS);
  const [draft, setDraft] = useState<{ user: string; job: string; severity: string; desc: string }>({ user: WORKERS[0].name, job: "", severity: "Medium", desc: "" });
  const filtered = WORKERS.filter((w) => w.name.toLowerCase().includes(search.toLowerCase()));
  const workersP = usePagination(filtered, 6);
  const errorsP = usePagination(errors, 6);

  const submitError = () => {
    if (!draft.job.trim() || !draft.desc.trim()) return;
    setErrors([{ id: Date.now(), user: draft.user, job: draft.job, desc: draft.desc, severity: draft.severity, date: "Just now" }, ...errors]);
    setDraft({ user: WORKERS[0].name, job: "", severity: "Medium", desc: "" });
    setErrorModal(false);
    setTab("errors");
  };

  return (
    <DashboardLayout title="User Monitoring" role="supervisor">
      {/* Tab pills */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
          {[
            { id: "performance" as const, label: "Performance", icon: Activity },
            { id: "errors" as const, label: "Error Reports", icon: FileWarning },
          ].map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <motion.button
                key={t.id}
                whileTap={{ scale: 0.97 }}
                onClick={() => setTab(t.id)}
                className={`relative flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${active ? "text-white" : "text-gray-600 hover:text-gray-900"}`}
              >
                {active && <motion.div layoutId="userMonTab" className="absolute inset-0 bg-primary rounded-lg pointer-events-none" transition={{ type: "spring", stiffness: 300, damping: 25 }} />}
                <span className="relative flex items-center gap-2"><Icon size={14} /> {t.label}</span>
              </motion.button>
            );
          })}
        </div>
        {tab === "errors" && (
          <motion.button
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => setErrorModal(true)}
            className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-xl text-xs font-semibold shadow-md shadow-primary/30"
          >
            <Plus size={14} /> New Error Report
          </motion.button>
        )}
      </div>

      <AnimatePresence mode="wait">
        {tab === "performance" ? (
          <motion.div
            key="perf"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
          >
            {/* Search */}
            <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-2.5 max-w-md mb-5 focus-within:border-primary transition-colors">
              <Search size={16} className="text-gray-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search team members…" className="bg-transparent text-sm flex-1 focus:outline-none" />
            </div>

            {/* Workers grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {workersP.pageItems.map((w, i) => (
                <motion.div
                  key={w.id}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  whileHover={{ y: -4, boxShadow: "0 14px 28px rgba(0,0,0,0.07)" }}
                  className="bg-white rounded-2xl border border-gray-100 p-5"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className="relative">
                      <div className="w-11 h-11 rounded-full bg-gradient-to-br from-primary to-sky-700 text-white text-sm font-bold flex items-center justify-center">{w.avatar}</div>
                      <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full ring-2 ring-white ${w.status === "active" ? "bg-emerald-400" : w.status === "idle" ? "bg-amber-400" : "bg-gray-400"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm text-gray-900 truncate">{w.name}</div>
                      <div className="text-[10px] text-gray-500">Last job: {w.lastJob}</div>
                    </div>
                    <div className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${w.efficiency >= 90 ? "bg-emerald-50 text-emerald-700" : w.efficiency >= 80 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"}`}>
                      {w.efficiency}%
                    </div>
                  </div>

                  {/* Time tracking bar */}
                  <div className="mb-3">
                    <div className="flex justify-between text-[10px] text-gray-500 mb-1">
                      <span>Today</span>
                      <span className="font-bold">{w.hoursToday}h / 8h</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <motion.div initial={{ width: 0 }} animate={{ width: `${(w.hoursToday / 8) * 100}%` }} transition={{ duration: 0.6 + i * 0.04 }} className="h-full bg-primary rounded-full" />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-3 border-t border-gray-100">
                    <div className="text-center">
                      <div className="text-base font-bold text-gray-900">{w.hoursWeek}h</div>
                      <div className="text-[9px] text-gray-500 uppercase tracking-wide">This week</div>
                    </div>
                    <div className="text-center">
                      <div className="text-base font-bold text-emerald-600">{w.jobsCompleted}</div>
                      <div className="text-[9px] text-gray-500 uppercase tracking-wide">Done</div>
                    </div>
                    <div className="text-center">
                      <div className={`text-base font-bold ${w.errors > 0 ? "text-red-600" : "text-gray-300"}`}>{w.errors}</div>
                      <div className="text-[9px] text-gray-500 uppercase tracking-wide">Errors</div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
            <div className="mt-4 bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <Pagination page={workersP.page} totalPages={workersP.totalPages} total={workersP.total} pageSize={workersP.pageSize} onChange={workersP.setPage} label="team members" />
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="err"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="bg-white rounded-2xl border border-gray-100 overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-900">Error Reports</h3>
              <p className="text-xs text-gray-500 mt-0.5">{errors.length} reports filed by you this month</p>
            </div>
            {errorsP.pageItems.map((e, i) => (
              <motion.div
                key={e.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                whileHover={{ backgroundColor: "rgb(249,250,251)" }}
                className="px-5 py-4 border-b border-gray-50 last:border-0 cursor-pointer"
              >
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-red-50 text-red-600 flex items-center justify-center shrink-0">
                    <AlertCircle size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-semibold text-sm text-gray-900">{e.user}</span>
                      <span className="text-xs text-gray-400">·</span>
                      <span className="text-xs text-primary font-medium">{e.job}</span>
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${SEVERITY[e.severity]}`}>{e.severity}</span>
                    </div>
                    <p className="text-sm text-gray-600">{e.desc}</p>
                    <div className="text-[10px] text-gray-400 mt-1">{e.date}</div>
                  </div>
                </div>
              </motion.div>
            ))}
            <Pagination page={errorsP.page} totalPages={errorsP.totalPages} total={errorsP.total} pageSize={errorsP.pageSize} onChange={errorsP.setPage} label="reports" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* New error modal */}
      <AnimatePresence>
        {errorModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setErrorModal(false)}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl p-6 max-w-md w-full"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-900">New Error Report</h3>
                <button onClick={() => setErrorModal(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-gray-700 mb-1.5 block">Worker</label>
                  <select value={draft.user} onChange={(e) => setDraft({ ...draft, user: e.target.value })} className="w-full bg-white border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary">
                    {WORKERS.map((w) => <option key={w.id}>{w.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-700 mb-1.5 block">Job ID</label>
                  <input value={draft.job} onChange={(e) => setDraft({ ...draft, job: e.target.value })} className="w-full bg-white border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary" placeholder="JOB-2148" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-700 mb-1.5 block">Severity</label>
                  <div className="grid grid-cols-3 gap-2">
                    {["Low", "Medium", "High"].map((s) => (
                      <button key={s} onClick={() => setDraft({ ...draft, severity: s })} className={`py-2 rounded-lg text-xs font-bold border-2 ${SEVERITY[s]} ${draft.severity === s ? "ring-2 ring-primary ring-offset-1" : "opacity-60"}`}>{s}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-700 mb-1.5 block">Description</label>
                  <textarea value={draft.desc} onChange={(e) => setDraft({ ...draft, desc: e.target.value })} rows={3} className="w-full bg-white border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary resize-none" placeholder="Describe the error…" />
                </div>
                <button onClick={submitError} disabled={!draft.job.trim() || !draft.desc.trim()} className="w-full mt-2 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed">Submit Report</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </DashboardLayout>
  );
}
