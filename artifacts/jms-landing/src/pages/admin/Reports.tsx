import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Download, FileText, Users, AlertTriangle, Clock, TrendingUp,
  ChevronRight, Filter,
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";

const TABS = [
  { id: "system", label: "System-wide", icon: TrendingUp },
  { id: "users", label: "User Performance", icon: Users },
  { id: "errors", label: "Error Reports", icon: AlertTriangle },
  { id: "time", label: "Time Tracking", icon: Clock },
];

const SYSTEM_METRICS = [
  { label: "Job Completion Rate", value: "87.4%", change: "+4.2%", trend: "up" },
  { label: "Avg Resolution Time", value: "4h 12m", change: "-18m", trend: "up" },
  { label: "Customer Satisfaction", value: "4.8/5", change: "+0.3", trend: "up" },
  { label: "Active Subscriptions", value: "1,142", change: "+86", trend: "up" },
];

const USER_PERFORMANCE = [
  { name: "Sarah Johnson", jobs: 47, completed: 45, score: 96, avg: "3h 24m" },
  { name: "Mike Chen", jobs: 38, completed: 35, score: 92, avg: "4h 12m" },
  { name: "Emma Wilson", jobs: 41, completed: 37, score: 90, avg: "3h 58m" },
  { name: "David Park", jobs: 29, completed: 24, score: 83, avg: "5h 02m" },
  { name: "Lisa Martinez", jobs: 32, completed: 26, score: 81, avg: "4h 47m" },
];

const ERRORS = [
  { id: "ERR-2841", type: "Database Timeout", count: 12, severity: "high", lastSeen: "2m ago" },
  { id: "ERR-2840", type: "Auth Failed", count: 8, severity: "medium", lastSeen: "14m ago" },
  { id: "ERR-2839", type: "Upload Rejected", count: 5, severity: "low", lastSeen: "1h ago" },
  { id: "ERR-2838", type: "Webhook Delivery Failed", count: 3, severity: "medium", lastSeen: "3h ago" },
];

const TIME_LOGS = [
  { user: "Sarah Johnson", project: "Server Maintenance", hours: 28.5, billable: true },
  { user: "Mike Chen", project: "Site Inspection", hours: 22.0, billable: true },
  { user: "Emma Wilson", project: "Quarterly Audit", hours: 35.5, billable: true },
  { user: "David Park", project: "Internal Training", hours: 8.0, billable: false },
];

const SEV_COLOR: Record<string, string> = {
  high: "bg-red-50 text-red-700 border-red-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  low: "bg-gray-50 text-gray-700 border-gray-200",
};

export default function Reports() {
  const [activeTab, setActiveTab] = useState("system");
  const [period, setPeriod] = useState("30d");

  return (
    <DashboardLayout title="Reports">
      {/* Header actions */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between mb-6">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
          {(["7d", "30d", "90d", "All"] as const).map((p) => (
            <motion.button key={p} whileTap={{ scale: 0.96 }} onClick={() => setPeriod(p)} className={`relative px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${period === p ? "text-white" : "text-gray-600 hover:text-gray-900"}`}>
              {period === p && <motion.div layoutId="periodBg" className="absolute inset-0 bg-primary rounded-lg -z-10" transition={{ type: "spring", stiffness: 300, damping: 25 }} />}
              {p === "All" ? "All time" : `Last ${p}`}
            </motion.button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <motion.button whileHover={{ y: -1 }} whileTap={{ scale: 0.97 }} className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:border-gray-300">
            <Filter size={14} /> Filters
          </motion.button>
          <motion.button whileHover={{ y: -1, scale: 1.02 }} whileTap={{ scale: 0.97 }} className="flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm font-medium shadow-lg shadow-primary/30">
            <Download size={14} /> Export PDF
          </motion.button>
        </div>
      </motion.div>

      {/* Tabs */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="flex border-b border-gray-100 overflow-x-auto">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`relative flex items-center gap-2 px-6 py-4 text-sm font-medium whitespace-nowrap transition-colors ${active ? "text-primary" : "text-gray-500 hover:text-gray-900"}`}>
                <Icon size={15} />
                {tab.label}
                {active && <motion.div layoutId="reportTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" transition={{ type: "spring", stiffness: 300, damping: 25 }} />}
              </button>
            );
          })}
        </div>

        <div className="p-6 min-h-[400px]">
          <AnimatePresence mode="wait">
            <motion.div key={activeTab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.25 }}>
              {activeTab === "system" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {SYSTEM_METRICS.map((m, i) => (
                    <motion.div key={m.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }} whileHover={{ y: -3 }} className="p-5 rounded-xl border border-gray-100 hover:border-primary/30 hover:shadow-lg transition-all">
                      <div className="text-xs font-medium text-gray-500">{m.label}</div>
                      <div className="text-2xl font-bold text-gray-900 mt-2">{m.value}</div>
                      <div className="flex items-center gap-1 mt-2 text-xs font-semibold text-emerald-600">
                        <TrendingUp size={11} /> {m.change}
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}

              {activeTab === "users" && (
                <table className="w-full">
                  <thead><tr>{["User", "Jobs", "Completed", "Score", "Avg time"].map((h) => <th key={h} className="text-left pb-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">{h}</th>)}</tr></thead>
                  <tbody>
                    {USER_PERFORMANCE.map((u, i) => (
                      <motion.tr key={u.name} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }} className="border-t border-gray-50 hover:bg-gray-50">
                        <td className="py-3.5 flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-sky-700 text-white text-xs font-bold flex items-center justify-center">
                            {u.name.split(" ").map((s) => s[0]).join("")}
                          </div>
                          <span className="text-sm font-medium text-gray-900">{u.name}</span>
                        </td>
                        <td className="py-3.5 text-sm text-gray-700">{u.jobs}</td>
                        <td className="py-3.5 text-sm text-gray-700">{u.completed}</td>
                        <td className="py-3.5">
                          <div className="flex items-center gap-2 w-32">
                            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <motion.div initial={{ width: 0 }} animate={{ width: `${u.score}%` }} transition={{ duration: 0.8, delay: i * 0.05 }} className={`h-full rounded-full ${u.score >= 90 ? "bg-emerald-500" : u.score >= 80 ? "bg-primary" : "bg-amber-500"}`} />
                            </div>
                            <span className="text-xs font-semibold text-gray-700">{u.score}</span>
                          </div>
                        </td>
                        <td className="py-3.5 text-sm text-gray-700">{u.avg}</td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              )}

              {activeTab === "errors" && (
                <div className="space-y-2">
                  {ERRORS.map((e, i) => (
                    <motion.div key={e.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }} whileHover={{ x: 4 }} className="flex items-center gap-4 p-4 border border-gray-100 rounded-xl hover:border-gray-300 hover:shadow-md transition-all cursor-pointer">
                      <div className="w-10 h-10 rounded-lg bg-red-50 text-red-500 flex items-center justify-center shrink-0">
                        <AlertTriangle size={18} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-gray-900">{e.type}</span>
                          <span className="text-xs text-gray-400 font-mono">{e.id}</span>
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">{e.count} occurrences · last seen {e.lastSeen}</div>
                      </div>
                      <span className={`px-2.5 py-1 rounded-lg border text-xs font-semibold uppercase ${SEV_COLOR[e.severity]}`}>{e.severity}</span>
                      <ChevronRight size={16} className="text-gray-300" />
                    </motion.div>
                  ))}
                </div>
              )}

              {activeTab === "time" && (
                <table className="w-full">
                  <thead><tr>{["User", "Project", "Hours", "Type"].map((h) => <th key={h} className="text-left pb-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">{h}</th>)}</tr></thead>
                  <tbody>
                    {TIME_LOGS.map((t, i) => (
                      <motion.tr key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }} className="border-t border-gray-50 hover:bg-gray-50">
                        <td className="py-3.5 text-sm font-medium text-gray-900">{t.user}</td>
                        <td className="py-3.5 text-sm text-gray-700">{t.project}</td>
                        <td className="py-3.5 text-sm font-semibold text-gray-900">{t.hours}h</td>
                        <td className="py-3.5">
                          <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg ${t.billable ? "bg-emerald-50 text-emerald-700" : "bg-gray-50 text-gray-600"}`}>
                            {t.billable ? "Billable" : "Internal"}
                          </span>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </DashboardLayout>
  );
}
