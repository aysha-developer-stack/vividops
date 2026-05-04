import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Pause, Square, Plus, Clock, Trash2, Briefcase } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import Pagination, { usePagination } from "@/components/Pagination";
import type { Role } from "@/lib/roles";

interface Entry {
  id: number;
  task: string;
  project: string;
  duration: number;
  date: string;
}

const SEED: Entry[] = [
  { id: 1, task: "Server diagnostics", project: "Server Maintenance #482", duration: 5430, date: "Today" },
  { id: 2, task: "Client meeting", project: "Site Inspection - North", duration: 2700, date: "Today" },
  { id: 3, task: "Documentation review", project: "Quarterly Audit", duration: 4520, date: "Yesterday" },
  { id: 4, task: "Equipment calibration", project: "Plumbing Overhaul", duration: 7250, date: "Yesterday" },
];

const PROJECTS = ["Server Maintenance #482", "Site Inspection - North", "Quarterly Audit", "Plumbing Overhaul", "Annual Safety Audit"];

function formatTime(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function formatShort(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function Timer({ role = "super-admin" as Role }: { role?: Role } = {}) {
  const [running, setRunning] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [task, setTask] = useState("");
  const [project, setProject] = useState(PROJECTS[0]);
  const [entries, setEntries] = useState<Entry[]>(SEED);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (running) {
      intervalRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running]);

  const stop = () => {
    if (seconds > 0 && task.trim()) {
      setEntries([{ id: Date.now(), task, project, duration: seconds, date: "Today" }, ...entries]);
    }
    setRunning(false);
    setSeconds(0);
    setTask("");
  };

  const remove = (id: number) => setEntries(entries.filter((e) => e.id !== id));

  const todayTotal = entries.filter((e) => e.date === "Today").reduce((acc, e) => acc + e.duration, 0);
  const weekTotal = entries.reduce((acc, e) => acc + e.duration, 0);
  const entriesP = usePagination(entries, 6);

  return (
    <DashboardLayout title="Time Tracker" role={role}>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Timer card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="lg:col-span-2 relative bg-gradient-to-br from-black via-gray-900 to-black rounded-2xl p-8 border border-gray-800 overflow-hidden"
        >
          <motion.div
            className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-primary/20 blur-3xl"
            animate={{ scale: running ? [1, 1.3, 1] : 1, opacity: running ? [0.5, 0.9, 0.5] : 0.4 }}
            transition={{ duration: 2, repeat: Infinity }}
          />
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-6">
              <div className={`w-2 h-2 rounded-full ${running ? "bg-emerald-400" : "bg-gray-500"}`} />
              <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                {running ? "Tracking time" : "Ready"}
              </span>
            </div>

            <div className="font-mono text-6xl md:text-7xl font-bold text-white tabular-nums mb-8">
              {formatTime(seconds)}
            </div>

            <div className="grid sm:grid-cols-2 gap-3 mb-6">
              <input
                value={task}
                onChange={(e) => setTask(e.target.value)}
                placeholder="What are you working on?"
                className="bg-white/5 border-2 border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-primary"
              />
              <select
                value={project}
                onChange={(e) => setProject(e.target.value)}
                className="bg-white/5 border-2 border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-primary"
              >
                {PROJECTS.map((p) => <option key={p} className="bg-black">{p}</option>)}
              </select>
            </div>

            <div className="flex gap-3">
              <motion.button
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                onClick={() => setRunning(!running)}
                className={`flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm shadow-lg transition-colors ${running ? "bg-amber-500 text-white shadow-amber-500/40 hover:bg-amber-600" : "bg-primary text-white shadow-primary/40 hover:bg-primary/90"}`}
              >
                {running ? <><Pause size={16} /> Pause</> : <><Play size={16} /> Start</>}
              </motion.button>
              {seconds > 0 && (
                <motion.button
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={stop}
                  className="flex items-center gap-2 px-6 py-3 bg-white/10 border border-white/10 hover:bg-white/15 text-white rounded-xl font-semibold text-sm"
                >
                  <Square size={14} /> Stop & Save
                </motion.button>
              )}
            </div>
          </div>
        </motion.div>

        {/* Totals */}
        <div className="space-y-4">
          {[
            { label: "Today", value: formatShort(todayTotal), color: "from-primary to-sky-700" },
            { label: "This week", value: formatShort(weekTotal), color: "from-emerald-500 to-emerald-700" },
            { label: "Entries", value: `${entries.length}`, color: "from-amber-500 to-orange-600" },
          ].map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 + i * 0.06 }}
              whileHover={{ y: -3, boxShadow: "0 12px 24px rgba(0,0,0,0.06)" }}
              className="bg-white border border-gray-100 rounded-2xl p-5 relative overflow-hidden"
            >
              <div className={`absolute top-0 right-0 w-24 h-24 rounded-full bg-gradient-to-br ${s.color} opacity-5 blur-2xl`} />
              <div className="relative z-10">
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">{s.label}</div>
                <div className="text-2xl font-bold text-gray-900 mt-1">{s.value}</div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Entries list */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-gray-900">Recent Entries</h3>
            <p className="text-xs text-gray-500 mt-0.5">Time logged across your projects</p>
          </div>
          <span className="text-xs text-gray-500 font-medium">{entries.length} entries</span>
        </div>
        <div>
          <AnimatePresence>
            {entriesP.pageItems.map((e, i) => (
              <motion.div
                key={e.id}
                layout
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ delay: i * 0.04 }}
                whileHover={{ backgroundColor: "rgb(249, 250, 251)" }}
                className="flex items-center gap-4 px-5 py-4 border-b border-gray-50 last:border-0 group"
              >
                <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Briefcase size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900">{e.task}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{e.project}</div>
                </div>
                <div className="hidden sm:flex items-center gap-1.5 text-xs text-gray-500">
                  <Clock size={12} />
                  {e.date}
                </div>
                <div className="font-mono text-sm font-semibold text-gray-900 tabular-nums w-20 text-right">
                  {formatTime(e.duration)}
                </div>
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => remove(e.id)}
                  className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                >
                  <Trash2 size={14} />
                </motion.button>
              </motion.div>
            ))}
          </AnimatePresence>
          {entries.length === 0 && (
            <div className="text-center py-12 text-sm text-gray-400">No entries yet — start the timer above.</div>
          )}
        </div>
        <Pagination page={entriesP.page} totalPages={entriesP.totalPages} total={entriesP.total} pageSize={entriesP.pageSize} onChange={entriesP.setPage} label="entries" />
      </motion.div>
    </DashboardLayout>
  );
}
