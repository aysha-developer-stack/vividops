import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Users, Briefcase, Activity, AlertTriangle, ArrowUpRight, ArrowDownRight,
  Plus, UserPlus, FileText, MessageSquare,
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";

const STATS = [
  { label: "Total Users", value: 1284, change: 12.4, trend: "up" as const, icon: Users, color: "from-primary to-sky-700", iconBg: "bg-primary/10", iconText: "text-primary" },
  { label: "Total Jobs", value: 482, change: 8.2, trend: "up" as const, icon: Briefcase, color: "from-emerald-500 to-emerald-700", iconBg: "bg-emerald-50", iconText: "text-emerald-600" },
  { label: "Active Jobs", value: 156, change: 5.6, trend: "up" as const, icon: Activity, color: "from-amber-500 to-orange-600", iconBg: "bg-amber-50", iconText: "text-amber-600" },
  { label: "Overdue Jobs", value: 23, change: 3.1, trend: "down" as const, icon: AlertTriangle, color: "from-red-500 to-rose-700", iconBg: "bg-red-50", iconText: "text-red-600" },
];

const ACTIVITY = [
  { user: "Sarah Johnson", action: "completed job", target: "Server Maintenance #482", time: "2m ago", color: "bg-emerald-500" },
  { user: "Mike Chen", action: "created job", target: "Site Inspection - North", time: "15m ago", color: "bg-primary" },
  { user: "Emma Wilson", action: "was promoted to", target: "Supervisor", time: "1h ago", color: "bg-amber-500" },
  { user: "David Park", action: "reported error in", target: "Quarterly Audit Report", time: "2h ago", color: "bg-red-500" },
  { user: "Lisa Martinez", action: "logged time on", target: "Plumbing Overhaul", time: "3h ago", color: "bg-purple-500" },
];

const QUICK_ACTIONS = [
  { label: "Create Job", icon: Plus, href: "/super-admin/jobs", color: "bg-primary" },
  { label: "Add User", icon: UserPlus, href: "/super-admin/users", color: "bg-emerald-600" },
  { label: "Generate Report", icon: FileText, href: "/super-admin/reports", color: "bg-amber-600" },
  { label: "Open Cliq", icon: MessageSquare, href: "/super-admin/communication", color: "bg-purple-600" },
];

const PERFORMANCE = [
  { day: "Mon", jobs: 45, completed: 38 },
  { day: "Tue", jobs: 52, completed: 47 },
  { day: "Wed", jobs: 48, completed: 41 },
  { day: "Thu", jobs: 61, completed: 55 },
  { day: "Fri", jobs: 58, completed: 50 },
  { day: "Sat", jobs: 32, completed: 28 },
  { day: "Sun", jobs: 28, completed: 25 },
];

function Counter({ value }: { value: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf: number;
    const start = performance.now();
    const dur = 1200;
    const step = (now: number) => {
      const p = Math.min((now - start) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(Math.round(value * eased));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{n.toLocaleString()}</>;
}

export default function SuperAdminDashboard() {
  const maxJobs = Math.max(...PERFORMANCE.map((d) => d.jobs));
  return (
    <DashboardLayout title="Dashboard Overview">
      {/* Welcome banner */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative overflow-hidden bg-gradient-to-br from-black via-gray-900 to-black rounded-2xl p-7 mb-8 border border-gray-800"
      >
        <motion.div
          className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-primary/20 blur-3xl"
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ duration: 6, repeat: Infinity }}
        />
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-white mb-1">Welcome back, Alex 👋</h2>
            <p className="text-gray-400 text-sm">Here's what's happening across your organization today.</p>
          </div>
          <div className="flex items-center gap-2">
            <motion.div
              className="w-2 h-2 rounded-full bg-green-400"
              animate={{ scale: [1, 1.4, 1], opacity: [1, 0.5, 1] }}
              transition={{ duration: 1.8, repeat: Infinity }}
            />
            <span className="text-xs text-gray-300 font-medium">All systems operational</span>
          </div>
        </div>
      </motion.div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        {STATS.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              whileHover={{ y: -4, boxShadow: "0 20px 40px rgba(0,0,0,0.08)" }}
              className="relative bg-white rounded-2xl p-6 border border-gray-100 cursor-pointer overflow-hidden group"
            >
              <div className={`absolute top-0 right-0 w-32 h-32 rounded-full bg-gradient-to-br ${stat.color} opacity-5 group-hover:opacity-10 transition-opacity blur-2xl`} />
              <div className="relative z-10">
                <div className="flex items-start justify-between mb-4">
                  <div className={`w-11 h-11 rounded-xl ${stat.iconBg} ${stat.iconText} flex items-center justify-center`}>
                    <Icon size={20} />
                  </div>
                  <span className={`flex items-center gap-1 text-xs font-semibold ${stat.trend === "up" ? "text-emerald-600 bg-emerald-50" : "text-red-600 bg-red-50"} px-2 py-1 rounded-full`}>
                    {stat.trend === "up" ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                    {stat.change}%
                  </span>
                </div>
                <div className="text-3xl font-bold text-gray-900 mb-1">
                  <Counter value={stat.value} />
                </div>
                <div className="text-sm text-gray-500">{stat.label}</div>
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Performance chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="lg:col-span-2 bg-white rounded-2xl p-6 border border-gray-100"
        >
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-bold text-gray-900">Weekly Performance</h3>
              <p className="text-xs text-gray-500 mt-0.5">Jobs created vs completed</p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-primary" />
                <span className="text-gray-600 font-medium">Created</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-emerald-500" />
                <span className="text-gray-600 font-medium">Completed</span>
              </div>
            </div>
          </div>
          <div className="flex items-end justify-between gap-3 h-56">
            {PERFORMANCE.map((d, i) => (
              <div key={d.day} className="flex-1 flex flex-col items-center gap-2 group">
                <div className="w-full flex items-end justify-center gap-1 flex-1">
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${(d.jobs / maxJobs) * 100}%` }}
                    transition={{ duration: 0.8, delay: 0.6 + i * 0.06, ease: "easeOut" }}
                    whileHover={{ scaleY: 1.04 }}
                    className="w-1/2 bg-gradient-to-t from-primary to-sky-400 rounded-t-lg relative origin-bottom cursor-pointer"
                  >
                    <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-black text-white text-[10px] px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap font-semibold">
                      {d.jobs}
                    </div>
                  </motion.div>
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${(d.completed / maxJobs) * 100}%` }}
                    transition={{ duration: 0.8, delay: 0.7 + i * 0.06, ease: "easeOut" }}
                    whileHover={{ scaleY: 1.04 }}
                    className="w-1/2 bg-gradient-to-t from-emerald-500 to-emerald-300 rounded-t-lg origin-bottom cursor-pointer"
                  />
                </div>
                <span className="text-xs text-gray-500 font-medium">{d.day}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Quick actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-white rounded-2xl p-6 border border-gray-100"
        >
          <h3 className="font-bold text-gray-900 mb-1">Quick Actions</h3>
          <p className="text-xs text-gray-500 mb-5">Jump straight to key tasks</p>
          <div className="space-y-3">
            {QUICK_ACTIONS.map((action, i) => {
              const Icon = action.icon;
              return (
                <motion.a
                  key={action.label}
                  href={action.href}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.6 + i * 0.06 }}
                  whileHover={{ x: 4, scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl bg-gray-50 hover:bg-white hover:shadow-md border border-transparent hover:border-gray-200 transition-all cursor-pointer group"
                >
                  <div className={`w-9 h-9 rounded-lg ${action.color} text-white flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform`}>
                    <Icon size={16} />
                  </div>
                  <span className="text-sm font-medium text-gray-700 flex-1">{action.label}</span>
                  <ArrowUpRight size={14} className="text-gray-400 group-hover:text-primary transition-colors" />
                </motion.a>
              );
            })}
          </div>
        </motion.div>
      </div>

      {/* Activity feed */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="bg-white rounded-2xl p-6 border border-gray-100"
      >
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-bold text-gray-900">Recent Activity</h3>
            <p className="text-xs text-gray-500 mt-0.5">Latest events across the platform</p>
          </div>
          <button className="text-xs font-medium text-primary hover:underline">View all</button>
        </div>
        <div className="space-y-1">
          {ACTIVITY.map((a, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.7 + i * 0.06 }}
              whileHover={{ x: 4, backgroundColor: "rgb(249, 250, 251)" }}
              className="flex items-center gap-4 p-3 rounded-xl cursor-pointer transition-colors"
            >
              <div className="relative shrink-0">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center text-xs font-bold text-gray-700">
                  {a.user.split(" ").map((s) => s[0]).join("").slice(0, 2)}
                </div>
                <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ${a.color} border-2 border-white`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-700 truncate">
                  <span className="font-semibold text-gray-900">{a.user}</span>{" "}
                  <span className="text-gray-500">{a.action}</span>{" "}
                  <span className="font-medium text-primary">{a.target}</span>
                </p>
              </div>
              <span className="text-xs text-gray-400 shrink-0">{a.time}</span>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </DashboardLayout>
  );
}
