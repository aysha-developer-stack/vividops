import { useState } from "react";
import { motion } from "framer-motion";
import {
  Activity, Users, Briefcase, AlertTriangle, CheckCircle2, Clock,
  FileText, Image, Wifi, UserCheck, TrendingUp, TrendingDown, Eye, Search,
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import Pagination, { usePagination } from "@/components/Pagination";

const SYSTEM_HEALTH = [
  { name: "Inspection Report Vault", status: "healthy", uptime: "99.98%", latency: "42ms", icon: FileText },
  { name: "Site Photo Storage", status: "healthy", uptime: "99.99%", latency: "12ms", icon: Image },
  { name: "Zoho Cliq Sync", status: "healthy", uptime: "99.85%", latency: "180ms", icon: Wifi },
  { name: "Client Portal", status: "degraded", uptime: "98.42%", latency: "320ms", icon: UserCheck },
];

const LIVE_USERS = [
  { name: "Sarah Johnson", role: "Admin", status: "Active", lastSeen: "now", action: "Viewing Reports", avatar: "SJ" },
  { name: "Mike Chen", role: "Supervisor", status: "Active", lastSeen: "now", action: "Reviewing JOB-2148", avatar: "MC" },
  { name: "Jordan Reed", role: "User", status: "On Job", lastSeen: "2m ago", action: "Timer running on JOB-2148", avatar: "JR" },
  { name: "Riley Adams", role: "User", status: "On Job", lastSeen: "5m ago", action: "Uploading files to JOB-2150", avatar: "RA" },
  { name: "Emma Wilson", role: "Supervisor", status: "Active", lastSeen: "12m ago", action: "Approving completed jobs", avatar: "EW" },
  { name: "David Park", role: "User", status: "Idle", lastSeen: "28m ago", action: "—", avatar: "DP" },
  { name: "Olivia Carter", role: "User", status: "Active", lastSeen: "now", action: "Adding checklist notes", avatar: "OC" },
];

const ACTIVITY_FEED = [
  { type: "job", text: "JOB-2148 marked for rework", user: "Sam Carter", time: "2m ago", color: "amber" },
  { type: "user", text: "New supervisor account created: Emma Wilson", user: "Super Admin", time: "1h ago", color: "emerald" },
  { type: "alert", text: "JOB-2143 is overdue (12h past due date)", user: "System", time: "3h ago", color: "red" },
  { type: "job", text: "JOB-2150 completed and approved", user: "Mike Chen", time: "4h ago", color: "emerald" },
  { type: "system", text: "Client Portal sync delay detected (320ms)", user: "System", time: "5h ago", color: "amber" },
  { type: "user", text: "User deactivated: Lisa Martinez", user: "Sarah Johnson", time: "6h ago", color: "gray" },
  { type: "job", text: "JOB-2152 created and assigned to 3 users", user: "Mike Chen", time: "8h ago", color: "primary" },
];

const KPIS = [
  { label: "Online Users", value: 47, total: 1284, change: "+12", trend: "up" as const, icon: Users, color: "emerald" },
  { label: "Active Jobs", value: 156, total: 482, change: "+8", trend: "up" as const, icon: Briefcase, color: "primary" },
  { label: "Overdue Jobs", value: 23, total: 482, change: "-4", trend: "down" as const, icon: AlertTriangle, color: "red" },
  { label: "Avg Response", value: "1.4h", change: "-12%", trend: "down" as const, icon: Clock, color: "amber" },
];

const STATUS_COLOR: Record<string, { dot: string; text: string; bg: string }> = {
  Active: { dot: "bg-emerald-500", text: "text-emerald-700", bg: "bg-emerald-50" },
  "On Job": { dot: "bg-primary", text: "text-primary", bg: "bg-primary/10" },
  Idle: { dot: "bg-gray-400", text: "text-gray-600", bg: "bg-gray-100" },
};

const HEALTH_COLOR: Record<string, { dot: string; text: string; bg: string; ring: string }> = {
  healthy: { dot: "bg-emerald-500", text: "text-emerald-700", bg: "bg-emerald-50", ring: "ring-emerald-200" },
  degraded: { dot: "bg-amber-500", text: "text-amber-700", bg: "bg-amber-50", ring: "ring-amber-200" },
  down: { dot: "bg-red-500", text: "text-red-700", bg: "bg-red-50", ring: "ring-red-200" },
};

export default function SystemMonitoring() {
  const [filter, setFilter] = useState<"All" | "Active" | "On Job" | "Idle">("All");
  const [search, setSearch] = useState("");
  const filtered = LIVE_USERS.filter(
    (u) => (filter === "All" || u.status === filter) && u.name.toLowerCase().includes(search.toLowerCase())
  );
  const activityP = usePagination(ACTIVITY_FEED, 8);
  const usersP = usePagination(filtered, 8);

  return (
    <DashboardLayout title="System Monitoring" role="super-admin">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {KPIS.map((k, i) => {
          const Icon = k.icon;
          return (
            <motion.div
              key={k.label}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="bg-white rounded-2xl border border-gray-100 p-5"
            >
              <div className="flex items-center justify-between mb-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-${k.color}-50 text-${k.color}-600`}>
                  <Icon size={18} />
                </div>
                <span className={`flex items-center gap-1 text-xs font-bold ${k.trend === "up" ? "text-emerald-600" : "text-red-500"}`}>
                  {k.trend === "up" ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                  {k.change}
                </span>
              </div>
              <div className="text-2xl font-bold text-gray-900">{k.value}{k.total && <span className="text-sm font-normal text-gray-400"> / {k.total}</span>}</div>
              <div className="text-xs text-gray-500 mt-0.5">{k.label}</div>
            </motion.div>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-3 gap-6 mb-6">
        {/* System health */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="p-5 border-b border-gray-100">
            <h3 className="font-bold text-gray-900 flex items-center gap-2"><Activity size={16} className="text-primary" /> System Health</h3>
            <p className="text-[11px] text-gray-500 mt-0.5">All services operational</p>
          </div>
          <div className="divide-y divide-gray-50">
            {SYSTEM_HEALTH.map((s) => {
              const Icon = s.icon;
              const c = HEALTH_COLOR[s.status];
              return (
                <div key={s.name} className="p-4 flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-lg ${c.bg} ${c.text} flex items-center justify-center`}><Icon size={16} /></div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-gray-900">{s.name}</div>
                    <div className="text-[11px] text-gray-500">Uptime {s.uptime} · Latency {s.latency}</div>
                  </div>
                  <span className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide ${c.bg} ${c.text}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${c.dot} animate-pulse`} />
                    {s.status}
                  </span>
                </div>
              );
            })}
          </div>
        </motion.div>

        {/* Activity feed */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="p-5 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-gray-900 flex items-center gap-2"><CheckCircle2 size={16} className="text-primary" /> System Activity</h3>
              <p className="text-[11px] text-gray-500 mt-0.5">Live feed across all users and jobs</p>
            </div>
            <span className="text-[10px] font-medium text-gray-500 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live
            </span>
          </div>
          <div className="max-h-[360px] overflow-y-auto">
            {activityP.pageItems.map((a, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                className="px-5 py-3.5 flex items-start gap-3 border-b border-gray-50 last:border-0 hover:bg-gray-50/50"
              >
                <div className={`mt-1 w-2 h-2 rounded-full bg-${a.color}-500 shrink-0`} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-gray-900">{a.text}</div>
                  <div className="text-[11px] text-gray-500 mt-0.5">{a.user} · {a.time}</div>
                </div>
              </motion.div>
            ))}
          </div>
          <Pagination page={activityP.page} totalPages={activityP.totalPages} total={activityP.total} pageSize={activityP.pageSize} onChange={activityP.setPage} label="events" />
        </motion.div>
      </div>

      {/* Live user table */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex flex-col md:flex-row gap-3 md:items-center justify-between">
          <div>
            <h3 className="font-bold text-gray-900 flex items-center gap-2"><Eye size={16} className="text-primary" /> Live User Activity</h3>
            <p className="text-[11px] text-gray-500 mt-0.5">Who's active right now and what they're doing</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
              <Search size={14} className="text-gray-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search users…" className="bg-transparent text-sm focus:outline-none w-40" />
            </div>
            <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
              {(["All", "Active", "On Job", "Idle"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`relative px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${filter === f ? "text-white" : "text-gray-600 hover:text-gray-900"}`}
                >
                  {filter === f && <motion.div layoutId="monFilterBg" className="absolute inset-0 bg-primary rounded-lg" transition={{ type: "spring", stiffness: 300, damping: 25 }} />}
                  <span className="relative">{f}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {["User", "Role", "Status", "Current Activity", "Last Seen"].map((h) => (
                  <th key={h} className="text-left px-6 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {usersP.pageItems.map((u, i) => {
                const c = STATUS_COLOR[u.status];
                return (
                  <motion.tr
                    key={u.name}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60"
                  >
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-sky-700 text-white text-xs font-bold flex items-center justify-center">{u.avatar}</div>
                        <div className="text-sm font-medium text-gray-900">{u.name}</div>
                      </div>
                    </td>
                    <td className="px-6 py-3.5"><span className="text-xs font-semibold text-gray-600">{u.role}</span></td>
                    <td className="px-6 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${c.bg} ${c.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${c.dot} ${u.status !== "Idle" ? "animate-pulse" : ""}`} />
                        {u.status}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-sm text-gray-700">{u.action}</td>
                    <td className="px-6 py-3.5 text-xs text-gray-500">{u.lastSeen}</td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && <div className="text-center py-12 text-sm text-gray-400">No users match.</div>}
        </div>
        <Pagination page={usersP.page} totalPages={usersP.totalPages} total={usersP.total} pageSize={usersP.pageSize} onChange={usersP.setPage} label="users" />
      </motion.div>
    </DashboardLayout>
  );
}
