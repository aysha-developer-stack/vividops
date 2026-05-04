import { useState, useEffect } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Briefcase, Clock, Bell, GraduationCap, Play, ArrowRight,
  CheckCircle2, Calendar, Flame, Sparkles,
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import Pagination, { usePagination } from "@/components/Pagination";

const ASSIGNED = [
  { id: "JOB-2148", title: "Server Maintenance", client: "BrightSpark Industries", due: "Today, 5pm", priority: "High" },
  { id: "JOB-2150", title: "Site Inspection", client: "North Bay Logistics", due: "Tomorrow", priority: "Medium" },
  { id: "JOB-2151", title: "Equipment Calibration", client: "Greenfield Co.", due: "Apr 24", priority: "Medium" },
  { id: "JOB-2155", title: "Emergency Repair", client: "Blue Ocean Ltd.", due: "Apr 25", priority: "High" },
  { id: "JOB-2156", title: "HVAC Quarterly Service", client: "Pacific Engineering", due: "Apr 26", priority: "Low" },
  { id: "JOB-2160", title: "Solar Panel Inspection", client: "Vivid Construction", due: "Apr 28", priority: "Medium" },
];

const NOTIFS = [
  { title: "New job assigned", desc: "JOB-2151 by Sam Carter", time: "5m ago", icon: Briefcase, color: "text-primary bg-primary/10" },
  { title: "Training due today", desc: "Workplace Safety Module 4", time: "1h ago", icon: GraduationCap, color: "text-amber-600 bg-amber-50" },
  { title: "Job marked complete", desc: "Great work on JOB-2147!", time: "2h ago", icon: CheckCircle2, color: "text-emerald-600 bg-emerald-50" },
  { title: "Still working?", desc: "Timer running on JOB-2148 for 1h", time: "3h ago", icon: Clock, color: "text-amber-600 bg-amber-50" },
  { title: "Rework cleared", desc: "Sam approved your fix on JOB-2147", time: "Yesterday", icon: CheckCircle2, color: "text-emerald-600 bg-emerald-50" },
  { title: "Schedule updated", desc: "JOB-2150 moved to tomorrow 9am", time: "Yesterday", icon: Calendar, color: "text-purple-600 bg-purple-50" },
];

const TRAINING = [
  { title: "Daily safety briefing", desc: "Always inspect ladders before climbing", color: "bg-amber-100 text-amber-700" },
  { title: "New procedure update", desc: "Updated checklist for site inspections", color: "bg-blue-100 text-blue-700" },
  { title: "Tool maintenance reminder", desc: "Calibrate torque wrenches every 90 days", color: "bg-purple-100 text-purple-700" },
  { title: "Heat stress advisory", desc: "Take 10-min breaks every hour above 35°C", color: "bg-red-100 text-red-700" },
];

export default function UserDashboard() {
  const [time, setTime] = useState(0);
  const [running, setRunning] = useState(false);
  const assignedP = usePagination(ASSIGNED, 5);
  const notifsP = usePagination(NOTIFS, 5);
  const trainingP = usePagination(TRAINING, 4);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setTime((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [running]);

  const fmt = (s: number) => `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  return (
    <DashboardLayout title="My Dashboard" role="user">
      {/* Welcome banner */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative bg-gradient-to-br from-black via-gray-900 to-black rounded-2xl p-6 md:p-8 mb-6 overflow-hidden border border-gray-800"
      >
        <motion.div className="absolute -top-16 -right-10 w-72 h-72 rounded-full bg-primary/30 blur-3xl" animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 5, repeat: Infinity }} />
        <div className="relative z-10 flex items-start justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-white">Good morning, Jordan ☀️</h2>
            <p className="text-sm text-gray-400 mt-1">You have 3 jobs assigned. Let's get started!</p>
          </div>
          <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-3 py-1.5 text-xs text-gray-300">
            <Flame size={12} className="text-orange-400" />
            <span>5-day streak</span>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Active timer card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="lg:col-span-2 relative bg-gradient-to-br from-primary via-sky-700 to-primary rounded-2xl p-6 overflow-hidden shadow-xl shadow-primary/20"
        >
          <motion.div
            className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-white/10 blur-2xl"
            animate={{ scale: running ? [1, 1.3, 1] : 1, opacity: running ? [0.3, 0.6, 0.3] : 0.3 }}
            transition={{ duration: 2, repeat: Infinity }}
          />
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-3">
              <div className={`w-2 h-2 rounded-full ${running ? "bg-emerald-300 animate-pulse" : "bg-white/40"}`} />
              <span className="text-xs font-bold text-white/80 uppercase tracking-wider">{running ? "Tracking time" : "Ready to start"}</span>
            </div>
            <div className="font-mono text-5xl md:text-6xl font-bold text-white tabular-nums mb-4">{fmt(time)}</div>
            <div className="text-sm text-white/80 mb-5">JOB-2148 · Server Maintenance</div>
            <div className="flex gap-2">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setRunning(!running)}
                className="flex items-center gap-2 px-5 py-2.5 bg-white text-primary rounded-xl text-sm font-bold shadow-lg"
              >
                <Play size={14} fill="currentColor" /> {running ? "Pause" : "Start Work"}
              </motion.button>
              <Link href="/user/jobs/JOB-2148">
                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="flex items-center gap-2 px-5 py-2.5 bg-white/10 border border-white/20 text-white rounded-xl text-sm font-semibold hover:bg-white/20">
                  Open job <ArrowRight size={14} />
                </motion.button>
              </Link>
            </div>
          </div>
        </motion.div>

        {/* Today stats */}
        <div className="space-y-4">
          {[
            { label: "Today's Hours", value: "6h 24m", icon: Clock, color: "from-primary to-sky-700", bg: "bg-primary/10", text: "text-primary" },
            { label: "Jobs Done", value: "11", icon: CheckCircle2, color: "from-emerald-500 to-emerald-700", bg: "bg-emerald-50", text: "text-emerald-600" },
          ].map((s, i) => {
            const Icon = s.icon;
            return (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15 + i * 0.06 }}
                whileHover={{ y: -3 }}
                className="relative bg-white rounded-2xl p-5 border border-gray-100 overflow-hidden"
              >
                <div className={`absolute top-0 right-0 w-24 h-24 rounded-full bg-gradient-to-br ${s.color} opacity-5 blur-2xl`} />
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
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Assigned jobs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 overflow-hidden"
        >
          <div className="p-5 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-gray-900">Assigned to me</h3>
              <p className="text-xs text-gray-500 mt-0.5">{ASSIGNED.length} jobs need your attention</p>
            </div>
            <Link href="/user/jobs"><span className="text-xs text-primary font-semibold hover:underline cursor-pointer">View all</span></Link>
          </div>
          {assignedP.pageItems.map((j, i) => (
            <Link key={j.id} href={`/user/jobs/${j.id}`}>
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.35 + i * 0.05 }}
                whileHover={{ backgroundColor: "rgb(249,250,251)", x: 4 }}
                className="flex items-center gap-4 px-5 py-4 border-b border-gray-50 last:border-0 cursor-pointer"
              >
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary/10 to-sky-100 text-primary flex items-center justify-center font-bold text-xs shrink-0">
                  {j.id.split("-")[1].slice(-2)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm text-gray-900">{j.title}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{j.client}</div>
                </div>
                <div className="hidden sm:flex items-center gap-1.5 text-xs text-gray-500">
                  <Calendar size={12} /> {j.due}
                </div>
                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${j.priority === "High" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>{j.priority}</span>
                <ArrowRight size={14} className="text-gray-300" />
              </motion.div>
            </Link>
          ))}
          <Pagination page={assignedP.page} totalPages={assignedP.totalPages} total={assignedP.total} pageSize={assignedP.pageSize} onChange={assignedP.setPage} label="jobs" />
        </motion.div>

        {/* Notifications + training */}
        <div className="space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-white rounded-2xl border border-gray-100 overflow-hidden"
          >
            <div className="p-5 border-b border-gray-100">
              <h3 className="font-bold text-gray-900 flex items-center gap-2"><Bell size={16} className="text-primary" /> Notifications</h3>
            </div>
            <div className="p-3">
              {notifsP.pageItems.map((n, i) => {
                const Icon = n.icon;
                return (
                  <motion.div
                    key={n.title}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.5 + i * 0.05 }}
                    whileHover={{ x: 3 }}
                    className="flex items-start gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer"
                  >
                    <div className={`w-8 h-8 rounded-lg ${n.color} flex items-center justify-center shrink-0`}>
                      <Icon size={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900">{n.title}</div>
                      <div className="text-[11px] text-gray-500 truncate">{n.desc}</div>
                      <div className="text-[10px] text-gray-400 mt-0.5">{n.time}</div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
            <Pagination page={notifsP.page} totalPages={notifsP.totalPages} total={notifsP.total} pageSize={notifsP.pageSize} onChange={notifsP.setPage} label="notifications" />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-100 rounded-2xl p-5"
          >
            <h3 className="font-bold text-amber-900 flex items-center gap-2 mb-3"><Sparkles size={16} /> Daily Training</h3>
            {trainingP.pageItems.map((t, i) => (
              <motion.div
                key={t.title}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 + i * 0.05 }}
                whileHover={{ x: 3 }}
                className="bg-white rounded-xl p-3 mb-2 last:mb-0 cursor-pointer"
              >
                <div className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full inline-block mb-2 ${t.color}`}>Update</div>
                <div className="text-sm font-semibold text-gray-900">{t.title}</div>
                <div className="text-xs text-gray-500 mt-0.5">{t.desc}</div>
              </motion.div>
            ))}
            <Pagination page={trainingP.page} totalPages={trainingP.totalPages} total={trainingP.total} pageSize={trainingP.pageSize} onChange={trainingP.setPage} label="updates" />
          </motion.div>
        </div>
      </div>
    </DashboardLayout>
  );
}
