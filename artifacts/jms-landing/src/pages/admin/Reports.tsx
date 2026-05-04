import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Download, FileText, Users, AlertTriangle, Clock, TrendingUp,
  ChevronRight, Filter, Shield, UserCog, User as UserIcon, Crown,
  X, Check, Search,
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import type { Role } from "@/lib/roles";

type UserRoleLabel = "Super Admin" | "Admin" | "Supervisor" | "User";
const ROLE_BADGE: Record<UserRoleLabel, { color: string; bg: string; icon: any }> = {
  "Super Admin": { color: "text-purple-700", bg: "bg-purple-50 border-purple-200", icon: Crown },
  Admin: { color: "text-red-700", bg: "bg-red-50 border-red-200", icon: Shield },
  Supervisor: { color: "text-amber-700", bg: "bg-amber-50 border-amber-200", icon: UserCog },
  User: { color: "text-primary", bg: "bg-primary/10 border-primary/20", icon: UserIcon },
};

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

interface UserPerf { name: string; role: UserRoleLabel; jobs: number; completed: number; score: number; avg: string; hours: number; rework: number; overdue: number; }
const USER_PERFORMANCE: UserPerf[] = [
  { name: "Sarah Johnson", role: "Admin",      jobs: 47, completed: 45, score: 96, avg: "3h 24m", hours: 162.5, rework: 1, overdue: 0 },
  { name: "Mike Chen",     role: "Supervisor", jobs: 38, completed: 35, score: 92, avg: "4h 12m", hours: 148.0, rework: 2, overdue: 1 },
  { name: "Emma Wilson",   role: "Supervisor", jobs: 41, completed: 37, score: 90, avg: "3h 58m", hours: 156.5, rework: 3, overdue: 1 },
  { name: "James Bennett", role: "Supervisor", jobs: 27, completed: 24, score: 88, avg: "4h 32m", hours: 122.0, rework: 2, overdue: 0 },
  { name: "Jordan Reed",   role: "User",       jobs: 34, completed: 31, score: 89, avg: "4h 18m", hours: 138.0, rework: 2, overdue: 1 },
  { name: "Riley Adams",   role: "User",       jobs: 31, completed: 28, score: 86, avg: "4h 35m", hours: 128.0, rework: 2, overdue: 1 },
  { name: "David Park",    role: "User",       jobs: 29, completed: 24, score: 83, avg: "5h 02m", hours: 116.0, rework: 4, overdue: 2 },
  { name: "Lisa Martinez", role: "User",       jobs: 32, completed: 26, score: 81, avg: "4h 47m", hours: 132.0, rework: 5, overdue: 3 },
  { name: "Olivia Carter", role: "User",       jobs: 26, completed: 23, score: 84, avg: "4h 28m", hours: 104.0, rework: 2, overdue: 1 },
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

export default function Reports({ role = "super-admin" as Role }: { role?: Role } = {}) {
  const [activeTab, setActiveTab] = useState("system");
  const [period, setPeriod] = useState("30d");
  const [userRoleFilter, setUserRoleFilter] = useState<"All" | UserRoleLabel>("All");
  const [filterOpen, setFilterOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState<("high" | "medium" | "low")[]>(["high", "medium", "low"]);
  const [billableFilter, setBillableFilter] = useState<"all" | "billable" | "internal">("all");
  const [minScore, setMinScore] = useState(0);
  const toggleSeverity = (s: "high" | "medium" | "low") =>
    setSeverityFilter((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  const resetFilters = () => {
    setSearch(""); setUserRoleFilter("All"); setSeverityFilter(["high", "medium", "low"]);
    setBillableFilter("all"); setMinScore(0);
  };
  const activeFilterCount =
    (search ? 1 : 0) +
    (userRoleFilter !== "All" ? 1 : 0) +
    (severityFilter.length < 3 ? 1 : 0) +
    (billableFilter !== "all" ? 1 : 0) +
    (minScore > 0 ? 1 : 0);
  const isSuperAdmin = role === "super-admin";
  const ROLE_FILTERS: ("All" | UserRoleLabel)[] = isSuperAdmin
    ? ["All", "Admin", "Supervisor", "User"]
    : ["All", "Supervisor", "User"];
  const filteredUsers = USER_PERFORMANCE.filter((u) =>
    (userRoleFilter === "All" || u.role === userRoleFilter) &&
    (search === "" || u.name.toLowerCase().includes(search.toLowerCase())) &&
    u.score >= minScore
  );
  const filteredErrors = ERRORS.filter((e) =>
    severityFilter.includes(e.severity as "high" | "medium" | "low") &&
    (search === "" || e.type.toLowerCase().includes(search.toLowerCase()) || e.id.toLowerCase().includes(search.toLowerCase()))
  );
  const filteredTime = TIME_LOGS.filter((t) =>
    (billableFilter === "all" || (billableFilter === "billable" ? t.billable : !t.billable)) &&
    (search === "" || t.user.toLowerCase().includes(search.toLowerCase()) || t.project.toLowerCase().includes(search.toLowerCase()))
  );
  const totalJobs = filteredUsers.reduce((s, u) => s + u.jobs, 0);
  const totalCompleted = filteredUsers.reduce((s, u) => s + u.completed, 0);
  const totalHours = filteredUsers.reduce((s, u) => s + u.hours, 0);
  const totalRework = filteredUsers.reduce((s, u) => s + u.rework, 0);

  const exportUserPDF = (u: UserPerf) => {
    const periodLabel = period === "All" ? "All time" : `Last ${period}`;
    const rate = u.jobs > 0 ? Math.round((u.completed / u.jobs) * 100) : 0;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Vivid OPS — ${u.name} Report</title>
<style>
*{box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f172a;margin:0;padding:40px;max-width:820px;margin:0 auto}
.brand{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #0ea5e9;padding-bottom:16px;margin-bottom:28px}
.brand h1{margin:0;font-size:22px;color:#0ea5e9;letter-spacing:1px}
.brand .meta{font-size:11px;color:#64748b;text-align:right}
.user{display:flex;align-items:center;gap:16px;margin-bottom:24px}
.avatar{width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#0ea5e9,#0369a1);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:20px}
.user h2{margin:0;font-size:20px}
.role{display:inline-block;padding:2px 10px;border-radius:6px;font-size:11px;font-weight:600;margin-top:4px;background:#f1f5f9;color:#334155;border:1px solid #e2e8f0}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:28px}
.kpi{padding:14px;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc}
.kpi .l{font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.5px;font-weight:600}
.kpi .v{font-size:22px;font-weight:700;margin-top:4px}
h3{font-size:13px;text-transform:uppercase;letter-spacing:.6px;color:#475569;margin:24px 0 10px}
table{width:100%;border-collapse:collapse;font-size:12px}
th{text-align:left;padding:10px;background:#f1f5f9;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#475569;border-bottom:1px solid #e2e8f0}
td{padding:10px;border-bottom:1px solid #f1f5f9}
.bar{height:6px;background:#e2e8f0;border-radius:3px;overflow:hidden;width:140px;display:inline-block;vertical-align:middle;margin-right:8px}
.bar>div{height:100%;background:${u.score >= 90 ? "#10b981" : u.score >= 80 ? "#0ea5e9" : "#f59e0b"};width:${u.score}%}
.foot{margin-top:40px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:10px;color:#94a3b8;text-align:center}
@media print{body{padding:20px}.no-print{display:none}}
.btn{position:fixed;top:20px;right:20px;background:#0ea5e9;color:#fff;border:0;padding:10px 18px;border-radius:8px;font-weight:600;cursor:pointer;box-shadow:0 4px 12px rgba(14,165,233,.4)}
</style></head><body>
<button class="btn no-print" onclick="window.print()">Save as PDF</button>
<div class="brand"><h1>VIVID OPS</h1><div class="meta">Vivid Engineering<br>Generated ${new Date().toLocaleString()}<br>Period: ${periodLabel}</div></div>
<div class="user">
  <div class="avatar">${u.name.split(" ").map((s) => s[0]).join("")}</div>
  <div><h2>${u.name}</h2><span class="role">${u.role}</span></div>
</div>
<h3>Performance summary</h3>
<div class="kpis">
  <div class="kpi"><div class="l">Total jobs</div><div class="v">${u.jobs}</div></div>
  <div class="kpi"><div class="l">Completed</div><div class="v" style="color:#10b981">${u.completed}</div></div>
  <div class="kpi"><div class="l">Completion rate</div><div class="v">${rate}%</div></div>
  <div class="kpi"><div class="l">Performance score</div><div class="v">${u.score}</div></div>
</div>
<h3>Detailed metrics</h3>
<table>
  <thead><tr><th>Metric</th><th>Value</th><th>Status</th></tr></thead>
  <tbody>
    <tr><td>Hours logged</td><td>${u.hours.toFixed(1)}h</td><td>—</td></tr>
    <tr><td>Average resolution time</td><td>${u.avg}</td><td>—</td></tr>
    <tr><td>Rework cases</td><td>${u.rework}</td><td style="color:${u.rework > 3 ? "#dc2626" : u.rework > 0 ? "#d97706" : "#10b981"}">${u.rework > 3 ? "High" : u.rework > 0 ? "Moderate" : "Excellent"}</td></tr>
    <tr><td>Overdue jobs</td><td>${u.overdue}</td><td style="color:${u.overdue > 0 ? "#dc2626" : "#10b981"}">${u.overdue > 0 ? "Needs attention" : "On track"}</td></tr>
    <tr><td>Performance score</td><td><span class="bar"><div></div></span>${u.score} / 100</td><td>${u.score >= 90 ? "Excellent" : u.score >= 80 ? "Good" : "Needs improvement"}</td></tr>
  </tbody>
</table>
<h3>Notes</h3>
<p style="font-size:12px;color:#475569;line-height:1.6">This report covers ${u.name}'s activity during the selected period (${periodLabel}). Score is calculated from completion rate, on-time delivery, rework frequency, and supervisor sign-off. For a deeper drill-down, refer to the System Monitoring and Job Overview modules.</p>
<div class="foot">Vivid OPS · Confidential · Generated for internal use only</div>
<script>setTimeout(()=>window.print(),300)</script>
</body></html>`;
    const w = window.open("", "_blank", "width=900,height=1000");
    if (!w) { alert("Please allow pop-ups to export the report."); return; }
    w.document.write(html);
    w.document.close();
  };

  return (
    <DashboardLayout title="Reports" role={role}>
      {/* Header actions */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between mb-6">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
          {(["7d", "30d", "90d", "All"] as const).map((p) => (
            <motion.button key={p} whileTap={{ scale: 0.96 }} onClick={() => setPeriod(p)} className={`relative px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${period === p ? "text-white" : "text-gray-600 hover:text-gray-900"}`}>
              {period === p && <motion.div layoutId="periodBg" className="absolute inset-0 bg-primary rounded-lg pointer-events-none" transition={{ type: "spring", stiffness: 300, damping: 25 }} />}
              <span className="relative">{p === "All" ? "All time" : `Last ${p}`}</span>
            </motion.button>
          ))}
        </div>
        <div className="flex items-center gap-2 relative">
          <motion.button whileHover={{ y: -1 }} whileTap={{ scale: 0.97 }} onClick={() => setFilterOpen((v) => !v)} className={`flex items-center gap-2 px-4 py-2.5 bg-white border rounded-xl text-sm font-medium transition-colors ${filterOpen || activeFilterCount > 0 ? "border-primary text-primary" : "border-gray-200 text-gray-700 hover:border-gray-300"}`}>
            <Filter size={14} /> Filters
            {activeFilterCount > 0 && <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-white text-[10px] font-bold">{activeFilterCount}</span>}
          </motion.button>
          <motion.button whileHover={{ y: -1, scale: 1.02 }} whileTap={{ scale: 0.97 }} className="flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm font-medium shadow-lg shadow-primary/30">
            <Download size={14} /> Export PDF
          </motion.button>

          <AnimatePresence>
            {filterOpen && (
              <>
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setFilterOpen(false)} className="fixed inset-0 z-40" />
                <motion.div initial={{ opacity: 0, y: -8, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.97 }} transition={{ type: "spring", stiffness: 300, damping: 25 }} className="absolute right-0 top-full mt-2 w-[340px] bg-white rounded-2xl border border-gray-100 shadow-2xl z-50 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                    <div className="flex items-center gap-2"><Filter size={14} className="text-primary" /><span className="text-sm font-bold text-gray-900">Filters</span>{activeFilterCount > 0 && <span className="text-[10px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">{activeFilterCount} active</span>}</div>
                    <button onClick={() => setFilterOpen(false)} className="p-1 hover:bg-gray-100 rounded-md text-gray-400"><X size={14} /></button>
                  </div>
                  <div className="p-4 space-y-4 max-h-[420px] overflow-y-auto">
                    <div>
                      <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Search</label>
                      <div className="relative mt-1">
                        <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={activeTab === "errors" ? "Error type or ID…" : activeTab === "time" ? "User or project…" : "User name…"} className="w-full pl-8 pr-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-primary" />
                      </div>
                    </div>

                    {(activeTab === "users" || activeTab === "system") && (
                      <div>
                        <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Role</label>
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {ROLE_FILTERS.map((r) => (
                            <button key={r} onClick={() => setUserRoleFilter(r)} className={`px-2.5 py-1 text-[11px] font-semibold rounded-md border transition ${userRoleFilter === r ? "bg-primary text-white border-primary" : "bg-white text-gray-600 border-gray-200 hover:border-primary/50"}`}>{r}</button>
                          ))}
                        </div>
                      </div>
                    )}

                    {activeTab === "users" && (
                      <div>
                        <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider flex justify-between"><span>Min performance score</span><span className="text-primary font-bold">{minScore}</span></label>
                        <input type="range" min={0} max={100} step={5} value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} className="w-full mt-2 accent-primary" />
                      </div>
                    )}

                    {activeTab === "errors" && (
                      <div>
                        <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Severity</label>
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {(["high", "medium", "low"] as const).map((s) => {
                            const on = severityFilter.includes(s);
                            return (
                              <button key={s} onClick={() => toggleSeverity(s)} className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-md border transition ${on ? `${SEV_COLOR[s]}` : "bg-white text-gray-400 border-gray-200"}`}>
                                {on && <Check size={10} />} {s.toUpperCase()}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {activeTab === "time" && (
                      <div>
                        <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Type</label>
                        <div className="flex gap-1.5 mt-1.5">
                          {(["all", "billable", "internal"] as const).map((b) => (
                            <button key={b} onClick={() => setBillableFilter(b)} className={`px-2.5 py-1 text-[11px] font-semibold rounded-md border capitalize transition ${billableFilter === b ? "bg-primary text-white border-primary" : "bg-white text-gray-600 border-gray-200 hover:border-primary/50"}`}>{b}</button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50">
                    <button onClick={resetFilters} className="text-xs font-semibold text-gray-500 hover:text-gray-900">Reset all</button>
                    <button onClick={() => setFilterOpen(false)} className="px-3 py-1.5 bg-primary hover:bg-primary/90 text-white text-xs font-semibold rounded-lg">Apply</button>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
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
                <div className="space-y-5">
                  {/* Header with role filter */}
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div>
                      <h3 className="text-base font-bold text-gray-900 flex items-center gap-2"><Users size={16} className="text-primary" /> Reports of all users</h3>
                      <p className="text-[11px] text-gray-500 mt-0.5">Per-user performance across the entire platform · {filteredUsers.length} {userRoleFilter === "All" ? "users" : userRoleFilter.toLowerCase() + "s"}</p>
                    </div>
                    <div className="flex gap-1 bg-gray-100 p-1 rounded-xl flex-wrap">
                      {ROLE_FILTERS.map((r) => (
                        <motion.button key={r} whileTap={{ scale: 0.96 }} onClick={() => setUserRoleFilter(r)} className={`relative px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${userRoleFilter === r ? "text-white" : "text-gray-600 hover:text-gray-900"}`}>
                          {userRoleFilter === r && <motion.div layoutId="userRoleBg" className="absolute inset-0 bg-primary rounded-lg pointer-events-none" transition={{ type: "spring", stiffness: 300, damping: 25 }} />}
                          <span className="relative">{r}</span>
                        </motion.button>
                      ))}
                    </div>
                  </div>

                  {/* Summary KPIs */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {[
                      { label: "Total jobs", value: totalJobs, icon: FileText, color: "primary" },
                      { label: "Completed", value: totalCompleted, icon: TrendingUp, color: "emerald" },
                      { label: "Hours logged", value: `${totalHours.toFixed(1)}h`, icon: Clock, color: "amber" },
                      { label: "Rework cases", value: totalRework, icon: AlertTriangle, color: "red" },
                    ].map((k, i) => {
                      const Icon = k.icon;
                      return (
                        <motion.div key={k.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className="p-4 rounded-xl border border-gray-100 bg-gray-50/50">
                          <div className={`w-8 h-8 rounded-lg bg-${k.color}-50 text-${k.color}-600 flex items-center justify-center mb-2`}><Icon size={14} /></div>
                          <div className="text-xl font-bold text-gray-900">{k.value}</div>
                          <div className="text-[11px] text-gray-500">{k.label}</div>
                        </motion.div>
                      );
                    })}
                  </div>

                  {/* Per-user table */}
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 rounded-lg">
                        <tr>{["User", "Role", "Jobs", "Completed", "Hours", "Rework", "Overdue", "Score", "Avg time", "Report"].map((h) => (
                          <th key={h} className="text-left px-3 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                        ))}</tr>
                      </thead>
                      <tbody>
                        {filteredUsers.map((u, i) => {
                          const badge = ROLE_BADGE[u.role];
                          const Icon = badge.icon;
                          return (
                            <motion.tr key={u.name} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }} className="border-t border-gray-50 hover:bg-gray-50/60">
                              <td className="px-3 py-3.5">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-sky-700 text-white text-xs font-bold flex items-center justify-center">
                                    {u.name.split(" ").map((s) => s[0]).join("")}
                                  </div>
                                  <span className="text-sm font-medium text-gray-900 whitespace-nowrap">{u.name}</span>
                                </div>
                              </td>
                              <td className="px-3 py-3.5">
                                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[11px] font-semibold ${badge.bg} ${badge.color}`}>
                                  <Icon size={10} /> {u.role}
                                </span>
                              </td>
                              <td className="px-3 py-3.5 text-sm text-gray-700 tabular-nums">{u.jobs}</td>
                              <td className="px-3 py-3.5 text-sm text-emerald-700 font-semibold tabular-nums">{u.completed}</td>
                              <td className="px-3 py-3.5 text-sm text-gray-700 tabular-nums">{u.hours.toFixed(1)}h</td>
                              <td className="px-3 py-3.5 text-sm tabular-nums">
                                <span className={u.rework > 3 ? "text-red-600 font-semibold" : u.rework > 0 ? "text-amber-600" : "text-gray-400"}>{u.rework}</span>
                              </td>
                              <td className="px-3 py-3.5 text-sm tabular-nums">
                                <span className={u.overdue > 0 ? "text-red-600 font-semibold" : "text-gray-400"}>{u.overdue}</span>
                              </td>
                              <td className="px-3 py-3.5">
                                <div className="flex items-center gap-2 w-28">
                                  <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                    <motion.div initial={{ width: 0 }} animate={{ width: `${u.score}%` }} transition={{ duration: 0.8, delay: i * 0.05 }} className={`h-full rounded-full ${u.score >= 90 ? "bg-emerald-500" : u.score >= 80 ? "bg-primary" : "bg-amber-500"}`} />
                                  </div>
                                  <span className="text-xs font-semibold text-gray-700">{u.score}</span>
                                </div>
                              </td>
                              <td className="px-3 py-3.5 text-sm text-gray-700 whitespace-nowrap">{u.avg}</td>
                              <td className="px-3 py-3.5">
                                <motion.button whileHover={{ y: -1, scale: 1.04 }} whileTap={{ scale: 0.94 }} onClick={() => exportUserPDF(u)} title={`Export ${u.name}'s report as PDF`} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-primary/10 hover:bg-primary hover:text-white text-primary rounded-lg text-[11px] font-semibold transition-colors whitespace-nowrap">
                                  <Download size={11} /> PDF
                                </motion.button>
                              </td>
                            </motion.tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {filteredUsers.length === 0 && <div className="text-center py-8 text-sm text-gray-400">No users in this role.</div>}
                  </div>
                </div>
              )}

              {activeTab === "errors" && (
                <div className="space-y-2">
                  {filteredErrors.length === 0 && <div className="text-center py-8 text-sm text-gray-400">No errors match current filters.</div>}
                  {filteredErrors.map((e, i) => (
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
                    {filteredTime.map((t, i) => (
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
