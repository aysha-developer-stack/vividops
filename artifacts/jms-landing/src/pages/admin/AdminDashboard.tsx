import { motion } from "framer-motion";
import { Link } from "wouter";
import {
  Briefcase, Users, CheckCircle2, Clock, ArrowUpRight, ArrowDownRight,
  Plus, UserPlus, FileText, TrendingUp,
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import Pagination, { usePagination } from "@/components/Pagination";

const STATS = [
  { label: "Total Jobs", value: 342, icon: Briefcase, change: 8.4, up: true, color: "from-primary to-sky-700", bg: "bg-primary/10", text: "text-primary" },
  { label: "Active Users", value: 86, icon: Users, change: 4.2, up: true, color: "from-emerald-500 to-emerald-700", bg: "bg-emerald-50", text: "text-emerald-600" },
  { label: "Completed", value: 124, icon: CheckCircle2, change: 12.7, up: true, color: "from-purple-500 to-purple-700", bg: "bg-purple-50", text: "text-purple-600" },
  { label: "Pending", value: 47, icon: Clock, change: 2.1, up: false, color: "from-amber-500 to-orange-600", bg: "bg-amber-50", text: "text-amber-600" },
];

const RECENT_JOBS = [
  { id: "JOB-2148", client: "Wilkinson Residence", supervisor: "Sam Carter", status: "In Progress", color: "bg-primary/10 text-primary" },
  { id: "JOB-2147", client: "Patel Residence", supervisor: "Mia Wong", status: "Completed", color: "bg-emerald-50 text-emerald-700" },
  { id: "JOB-2146", client: "Greenfield Builders", supervisor: "Chris Park", status: "Completed", color: "bg-emerald-50 text-emerald-700" },
  { id: "JOB-2145", client: "Thompson Residence", supervisor: "Sam Carter", status: "Overdue", color: "bg-red-50 text-red-700" },
  { id: "JOB-2144", client: "Nguyen Residence", supervisor: "Mia Wong", status: "In Progress", color: "bg-primary/10 text-primary" },
  { id: "JOB-2143", client: "Sterling Homes", supervisor: "Chris Park", status: "Completed", color: "bg-emerald-50 text-emerald-700" },
  { id: "JOB-2142", client: "Vivid Construction", supervisor: "Sam Carter", status: "Rework", color: "bg-orange-50 text-orange-700" },
  { id: "JOB-2141", client: "Apex Builders", supervisor: "Mia Wong", status: "In Progress", color: "bg-primary/10 text-primary" },
  { id: "JOB-2140", client: "Northern Estate Homes", supervisor: "Chris Park", status: "Pending", color: "bg-amber-50 text-amber-700" },
  { id: "JOB-2139", client: "Coastal Heritage Homes", supervisor: "Sam Carter", status: "Completed", color: "bg-emerald-50 text-emerald-700" },
];

const TEAM = [
  { name: "Sam Carter", role: "Supervisor", jobs: 12, completed: 9 },
  { name: "Mia Wong", role: "Supervisor", jobs: 8, completed: 7 },
  { name: "Chris Park", role: "Supervisor", jobs: 10, completed: 6 },
  { name: "Riley Adams", role: "Field User", jobs: 14, completed: 11 },
  { name: "Olivia Carter", role: "Field User", jobs: 9, completed: 8 },
  { name: "James Bennett", role: "Field User", jobs: 7, completed: 5 },
  { name: "Lisa Martinez", role: "Field User", jobs: 11, completed: 10 },
  { name: "Jordan Reed", role: "Field User", jobs: 13, completed: 9 },
];

export default function AdminDashboard() {
  const recentP = usePagination(RECENT_JOBS, 6);
  const teamP = usePagination(TEAM, 5);
  return (
    <DashboardLayout title="Admin Overview" role="admin">
      {/* Banner */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative bg-gradient-to-br from-black via-gray-900 to-black rounded-2xl p-6 md:p-8 mb-6 overflow-hidden border border-gray-800"
      >
        <motion.div
          className="absolute -top-16 -right-10 w-72 h-72 rounded-full bg-primary/30 blur-3xl"
          animate={{ scale: [1, 1.1, 1], opacity: [0.4, 0.7, 0.4] }}
          transition={{ duration: 5, repeat: Infinity }}
        />
        <div className="relative z-10 flex items-start justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-white">Welcome back, Jamie 👋</h2>
            <p className="text-sm text-gray-400 mt-1">Here's a snapshot of operations across your team.</p>
          </div>
          <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-3 py-1.5 text-xs text-gray-300">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> All systems operational
          </div>
        </div>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {STATS.map((s, i) => {
          const Icon = s.icon;
          return (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 + i * 0.06 }}
              whileHover={{ y: -4, boxShadow: "0 14px 28px rgba(0,0,0,0.07)" }}
              className="relative bg-white rounded-2xl p-5 border border-gray-100 overflow-hidden"
            >
              <div className={`absolute top-0 right-0 w-32 h-32 rounded-full bg-gradient-to-br ${s.color} opacity-5 blur-2xl`} />
              <div className="relative z-10 flex items-start justify-between">
                <div className={`w-10 h-10 rounded-xl ${s.bg} ${s.text} flex items-center justify-center`}>
                  <Icon size={18} />
                </div>
                <div className={`flex items-center gap-0.5 text-xs font-bold px-2 py-0.5 rounded-full ${s.up ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                  {s.up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                  {s.change}%
                </div>
              </div>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 + i * 0.06 }}
                className="text-3xl font-bold text-gray-900 mt-4"
              >
                {s.value}
              </motion.div>
              <div className="text-xs text-gray-500 font-medium mt-1">{s.label}</div>
            </motion.div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent jobs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 overflow-hidden"
        >
          <div className="p-5 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-gray-900">Recent Jobs</h3>
              <p className="text-xs text-gray-500 mt-0.5">Latest job activity across all teams</p>
            </div>
            <Link href="/admin/jobs" className="text-xs text-primary font-semibold hover:underline">View all</Link>
          </div>
          {recentP.pageItems.map((j, i) => (
            <motion.div
              key={j.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.35 + i * 0.05 }}
              whileHover={{ backgroundColor: "rgb(249, 250, 251)", x: 4 }}
              className="flex items-center gap-4 px-5 py-4 border-b border-gray-50 last:border-0 cursor-pointer"
            >
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary/10 to-sky-100 text-primary flex items-center justify-center font-bold text-xs shrink-0">
                {j.id.split("-")[1].slice(-2)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm text-gray-900">{j.client}</div>
                <div className="text-xs text-gray-500 mt-0.5">{j.id} · Supervised by {j.supervisor}</div>
              </div>
              <span className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded-full ${j.color}`}>{j.status}</span>
            </motion.div>
          ))}
          <Pagination page={recentP.page} totalPages={recentP.totalPages} total={recentP.total} pageSize={recentP.pageSize} onChange={recentP.setPage} label="jobs" />
        </motion.div>

        {/* Team performance */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-white rounded-2xl border border-gray-100 overflow-hidden"
        >
          <div className="p-5 border-b border-gray-100">
            <h3 className="font-bold text-gray-900 flex items-center gap-2"><TrendingUp size={16} className="text-primary" /> Team Performance</h3>
            <p className="text-xs text-gray-500 mt-0.5">Top performers this week</p>
          </div>
          <div className="p-5 space-y-4">
            {teamP.pageItems.map((t, i) => {
              const pct = Math.round((t.completed / t.jobs) * 100);
              return (
                <motion.div
                  key={t.name}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5 + i * 0.06 }}
                >
                  <div className="flex items-center gap-3 mb-1.5">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-sky-700 text-white text-xs font-bold flex items-center justify-center">
                      {t.name.split(" ").map((s) => s[0]).join("")}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-gray-900 truncate">{t.name}</div>
                      <div className="text-[10px] text-gray-500">{t.role}</div>
                    </div>
                    <div className="text-xs font-bold text-gray-900">{pct}%</div>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden ml-11">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ delay: 0.6 + i * 0.06, duration: 0.8, ease: "easeOut" }}
                      className="h-full rounded-full bg-primary"
                    />
                  </div>
                </motion.div>
              );
            })}
          </div>
          <Pagination page={teamP.page} totalPages={teamP.totalPages} total={teamP.total} pageSize={teamP.pageSize} onChange={teamP.setPage} label="members" />
        </motion.div>
      </div>

      {/* Quick actions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6"
      >
        {[
          { label: "Create Job", icon: Plus, color: "from-primary to-sky-700", href: "/admin/jobs" },
          { label: "Add User", icon: UserPlus, color: "from-emerald-500 to-emerald-700", href: "/admin/users" },
          { label: "Generate Report", icon: FileText, color: "from-amber-500 to-orange-600", href: "/admin/reports" },
        ].map((q) => {
          const Icon = q.icon;
          return (
            <Link key={q.label} href={q.href}>
              <motion.div
                whileHover={{ y: -3, scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="flex items-center gap-3 bg-white border border-gray-100 rounded-2xl p-4 hover:border-primary/30 hover:shadow-lg transition-all text-left group cursor-pointer"
              >
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${q.color} text-white flex items-center justify-center shadow-md`}>
                  <Icon size={18} />
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-sm text-gray-900">{q.label}</div>
                  <div className="text-[11px] text-gray-500">Click to start</div>
                </div>
                <ArrowUpRight size={16} className="text-gray-300 group-hover:text-primary group-hover:-translate-y-0.5 group-hover:translate-x-0.5 transition-all" />
              </motion.div>
            </Link>
          );
        })}
      </motion.div>
    </DashboardLayout>
  );
}
