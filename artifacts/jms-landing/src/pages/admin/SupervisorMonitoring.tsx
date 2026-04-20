import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Activity, Briefcase, Clock, AlertCircle, CheckCircle2,
  TrendingUp, TrendingDown, Eye, MoreHorizontal,
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";

interface Supervisor {
  id: number;
  name: string;
  avatar: string;
  team: string;
  activeJobs: number;
  completedJobs: number;
  overdue: number;
  avgRating: number;
  hoursThisWeek: number;
  status: "online" | "away" | "offline";
  trend: number;
  lastSeen: string;
}

const SUPERVISORS: Supervisor[] = [
  { id: 1, name: "Sam Carter", avatar: "SC", team: "North Region", activeJobs: 12, completedJobs: 48, overdue: 1, avgRating: 4.8, hoursThisWeek: 38.5, status: "online", trend: 8.2, lastSeen: "Active now" },
  { id: 2, name: "Mia Wong", avatar: "MW", team: "Central Hub", activeJobs: 8, completedJobs: 52, overdue: 0, avgRating: 4.9, hoursThisWeek: 41.0, status: "online", trend: 12.4, lastSeen: "Active now" },
  { id: 3, name: "Chris Park", avatar: "CP", team: "South Region", activeJobs: 10, completedJobs: 36, overdue: 3, avgRating: 4.4, hoursThisWeek: 35.2, status: "away", trend: -2.1, lastSeen: "12m ago" },
  { id: 4, name: "Riley Adams", avatar: "RA", team: "Logistics", activeJobs: 6, completedJobs: 40, overdue: 0, avgRating: 4.7, hoursThisWeek: 36.8, status: "online", trend: 5.6, lastSeen: "Active now" },
  { id: 5, name: "Jordan Lee", avatar: "JL", team: "Plant Ops", activeJobs: 9, completedJobs: 31, overdue: 2, avgRating: 4.3, hoursThisWeek: 32.4, status: "offline", trend: -4.8, lastSeen: "2h ago" },
];

const STATUS_DOT: Record<Supervisor["status"], string> = {
  online: "bg-emerald-400",
  away: "bg-amber-400",
  offline: "bg-gray-400",
};

export default function SupervisorMonitoring() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Supervisor | null>(null);

  const filtered = SUPERVISORS.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()));

  const totalActive = SUPERVISORS.reduce((acc, s) => acc + s.activeJobs, 0);
  const totalCompleted = SUPERVISORS.reduce((acc, s) => acc + s.completedJobs, 0);
  const totalOverdue = SUPERVISORS.reduce((acc, s) => acc + s.overdue, 0);
  const avgHours = (SUPERVISORS.reduce((acc, s) => acc + s.hoursThisWeek, 0) / SUPERVISORS.length).toFixed(1);

  return (
    <DashboardLayout title="Supervisor Monitoring" role="admin">
      {/* Top stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Active Supervisors", value: SUPERVISORS.filter((s) => s.status === "online").length, icon: Activity, color: "from-emerald-500 to-emerald-700", bg: "bg-emerald-50", text: "text-emerald-600" },
          { label: "Active Jobs", value: totalActive, icon: Briefcase, color: "from-primary to-sky-700", bg: "bg-primary/10", text: "text-primary" },
          { label: "Completed", value: totalCompleted, icon: CheckCircle2, color: "from-purple-500 to-purple-700", bg: "bg-purple-50", text: "text-purple-600" },
          { label: "Overdue", value: totalOverdue, icon: AlertCircle, color: "from-red-500 to-rose-700", bg: "bg-red-50", text: "text-red-600" },
        ].map((s, i) => {
          const Icon = s.icon;
          return (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              whileHover={{ y: -3, boxShadow: "0 12px 24px rgba(0,0,0,0.06)" }}
              className="relative bg-white rounded-2xl p-5 border border-gray-100 overflow-hidden"
            >
              <div className={`absolute top-0 right-0 w-32 h-32 rounded-full bg-gradient-to-br ${s.color} opacity-5 blur-2xl`} />
              <div className="relative z-10 flex items-center justify-between">
                <div>
                  <div className="text-xs text-gray-500 font-medium uppercase tracking-wider">{s.label}</div>
                  <div className="text-2xl font-bold text-gray-900 mt-1">{s.value}</div>
                </div>
                <div className={`w-11 h-11 rounded-xl ${s.bg} ${s.text} flex items-center justify-center`}>
                  <Icon size={20} />
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-2.5 max-w-md mb-6 focus-within:border-primary transition-colors">
        <Search size={16} className="text-gray-400" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search supervisors…" className="bg-transparent text-sm flex-1 focus:outline-none" />
      </div>

      {/* Supervisor cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filtered.map((sup, i) => (
          <motion.div
            key={sup.id}
            layout
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
            whileHover={{ y: -5, boxShadow: "0 18px 36px rgba(0,0,0,0.07)" }}
            className="bg-white rounded-2xl border border-gray-100 p-5 cursor-pointer overflow-hidden group"
            onClick={() => setSelected(sup)}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-sky-700 text-white font-bold flex items-center justify-center">
                    {sup.avatar}
                  </div>
                  <span className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full ring-2 ring-white ${STATUS_DOT[sup.status]}`} />
                </div>
                <div>
                  <div className="font-bold text-gray-900">{sup.name}</div>
                  <div className="text-xs text-gray-500">{sup.team}</div>
                  <div className="text-[10px] text-gray-400 mt-0.5">{sup.lastSeen}</div>
                </div>
              </div>
              <button className="p-1.5 rounded-lg text-gray-300 hover:text-gray-600 hover:bg-gray-100 opacity-0 group-hover:opacity-100 transition-all">
                <MoreHorizontal size={16} />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className="text-center p-2 rounded-lg bg-primary/5">
                <div className="text-lg font-bold text-primary">{sup.activeJobs}</div>
                <div className="text-[10px] text-gray-500 uppercase tracking-wide">Active</div>
              </div>
              <div className="text-center p-2 rounded-lg bg-emerald-50">
                <div className="text-lg font-bold text-emerald-600">{sup.completedJobs}</div>
                <div className="text-[10px] text-gray-500 uppercase tracking-wide">Done</div>
              </div>
              <div className="text-center p-2 rounded-lg bg-red-50">
                <div className="text-lg font-bold text-red-600">{sup.overdue}</div>
                <div className="text-[10px] text-gray-500 uppercase tracking-wide">Late</div>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1 text-gray-600">
                <Clock size={12} /> {sup.hoursThisWeek}h this week
              </div>
              <div className={`flex items-center gap-0.5 font-bold ${sup.trend > 0 ? "text-emerald-600" : "text-red-600"}`}>
                {sup.trend > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                {Math.abs(sup.trend)}%
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Detail drawer */}
      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelected(null)}
            className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-0 md:p-6"
          >
            <motion.div
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 50, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-t-3xl md:rounded-2xl p-6 max-w-md w-full"
            >
              <div className="flex items-center gap-4 mb-6">
                <div className="relative">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-sky-700 text-white text-xl font-bold flex items-center justify-center">{selected.avatar}</div>
                  <span className={`absolute bottom-0 right-0 w-4 h-4 rounded-full ring-2 ring-white ${STATUS_DOT[selected.status]}`} />
                </div>
                <div className="flex-1">
                  <div className="font-bold text-xl text-gray-900">{selected.name}</div>
                  <div className="text-sm text-gray-500">{selected.team}</div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-amber-500">★ {selected.avgRating}</div>
                  <div className="text-[10px] text-gray-500">Avg rating</div>
                </div>
              </div>

              <div className="space-y-3">
                {[
                  { label: "Hours this week", val: `${selected.hoursThisWeek}h`, max: 40 },
                  { label: "Job completion rate", val: `${Math.round(selected.completedJobs / (selected.completedJobs + selected.activeJobs) * 100)}%`, max: 100 },
                ].map((m) => (
                  <div key={m.label}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-500">{m.label}</span>
                      <span className="font-bold text-gray-900">{m.val}</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <motion.div initial={{ width: 0 }} animate={{ width: m.val }} transition={{ duration: 0.6 }} className="h-full bg-primary rounded-full" />
                    </div>
                  </div>
                ))}
              </div>

              <button className="mt-6 w-full py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 flex items-center justify-center gap-2">
                <Eye size={14} /> View full activity log
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </DashboardLayout>
  );
}
