import { useState } from "react";
import { motion } from "framer-motion";
import {
  Play, BookOpen, Award, Clock, CheckCircle2, Lock,
  Search, Filter, GraduationCap,
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import type { Role } from "@/lib/roles";

const CATEGORIES = ["All", "Onboarding", "Safety", "Technical", "Leadership"];

const COURSES = [
  { id: 1, title: "Vivid Engineering Platform Onboarding", category: "Onboarding", lessons: 8, duration: "1h 24m", progress: 100, level: "Beginner", thumb: "from-primary to-sky-700" },
  { id: 2, title: "Workplace Safety Fundamentals", category: "Safety", lessons: 12, duration: "2h 10m", progress: 75, level: "Beginner", thumb: "from-amber-500 to-orange-600" },
  { id: 3, title: "Advanced Job Scheduling", category: "Technical", lessons: 15, duration: "3h 45m", progress: 40, level: "Advanced", thumb: "from-emerald-500 to-emerald-700" },
  { id: 4, title: "Team Leadership Essentials", category: "Leadership", lessons: 10, duration: "2h 30m", progress: 0, level: "Intermediate", thumb: "from-purple-500 to-indigo-700" },
  { id: 5, title: "Equipment Handling Certification", category: "Safety", lessons: 6, duration: "1h 05m", progress: 100, level: "Beginner", thumb: "from-red-500 to-rose-700" },
  { id: 6, title: "Reports & Analytics Mastery", category: "Technical", lessons: 9, duration: "1h 50m", progress: 0, level: "Intermediate", thumb: "from-cyan-500 to-blue-700" },
];

const LEVEL_COLOR: Record<string, string> = {
  Beginner: "bg-emerald-50 text-emerald-700",
  Intermediate: "bg-amber-50 text-amber-700",
  Advanced: "bg-red-50 text-red-700",
};

export default function Training({ role = "super-admin" as Role }: { role?: Role } = {}) {
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");

  const filtered = COURSES.filter((c) =>
    (filter === "All" || c.category === filter) &&
    c.title.toLowerCase().includes(search.toLowerCase())
  );

  const completed = COURSES.filter((c) => c.progress === 100).length;
  const inProgress = COURSES.filter((c) => c.progress > 0 && c.progress < 100).length;
  const totalHours = COURSES.reduce((acc, c) => {
    const [h, m] = c.duration.split(" ");
    return acc + parseInt(h) + parseInt(m) / 60;
  }, 0);

  return (
    <DashboardLayout title="Training & Learning" role={role}>
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {[
          { label: "Courses Completed", value: completed, total: COURSES.length, icon: CheckCircle2, color: "from-emerald-500 to-emerald-700", bg: "bg-emerald-50", text: "text-emerald-600" },
          { label: "In Progress", value: inProgress, icon: BookOpen, color: "from-primary to-sky-700", bg: "bg-primary/10", text: "text-primary" },
          { label: "Learning Hours", value: totalHours.toFixed(1), icon: Clock, color: "from-amber-500 to-orange-600", bg: "bg-amber-50", text: "text-amber-600" },
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
              <div className={`absolute top-0 right-0 w-24 h-24 rounded-full bg-gradient-to-br ${s.color} opacity-5 blur-2xl`} />
              <div className="relative z-10 flex items-center justify-between">
                <div>
                  <div className="text-xs text-gray-500 font-medium uppercase tracking-wider">{s.label}</div>
                  <div className="text-2xl font-bold text-gray-900 mt-1">
                    {s.value}{s.total ? <span className="text-sm font-medium text-gray-400">/{s.total}</span> : ""}
                  </div>
                </div>
                <div className={`w-11 h-11 rounded-xl ${s.bg} ${s.text} flex items-center justify-center`}>
                  <Icon size={20} />
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Toolbar */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between mb-6">
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-2.5 max-w-md flex-1 focus-within:border-primary transition-colors">
          <Search size={16} className="text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search courses…" className="bg-transparent text-sm flex-1 focus:outline-none" />
        </div>
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl overflow-x-auto">
          {CATEGORIES.map((c) => (
            <motion.button key={c} whileTap={{ scale: 0.96 }} onClick={() => setFilter(c)} className={`relative px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${filter === c ? "text-white" : "text-gray-600 hover:text-gray-900"}`}>
              {filter === c && <motion.div layoutId="trainingFilter" className="absolute inset-0 bg-primary rounded-lg pointer-events-none" transition={{ type: "spring", stiffness: 300, damping: 25 }} />}
              <span className="relative">{c}</span>
            </motion.button>
          ))}
        </div>
      </motion.div>

      {/* Course grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filtered.map((c, i) => (
          <motion.div
            key={c.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
            whileHover={{ y: -6 }}
            className="bg-white rounded-2xl border border-gray-100 overflow-hidden cursor-pointer group hover:shadow-xl transition-shadow"
          >
            {/* Thumbnail */}
            <div className={`relative h-36 bg-gradient-to-br ${c.thumb} overflow-hidden`}>
              <motion.div
                className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  whileHover={{ scale: 1 }}
                  animate={{ scale: 1 }}
                  className="w-14 h-14 rounded-full bg-white/95 text-primary flex items-center justify-center shadow-2xl"
                >
                  <Play size={22} fill="currentColor" className="ml-1" />
                </motion.div>
              </motion.div>
              <div className="absolute top-3 left-3 flex gap-2">
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded ${LEVEL_COLOR[c.level]}`}>{c.level}</span>
              </div>
              {c.progress === 100 && (
                <motion.div
                  initial={{ scale: 0, rotate: -45 }}
                  animate={{ scale: 1, rotate: 0 }}
                  className="absolute top-3 right-3 w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-lg"
                >
                  <CheckCircle2 size={16} />
                </motion.div>
              )}
              <GraduationCap className="absolute -bottom-3 -right-3 text-white/20" size={80} />
            </div>

            {/* Body */}
            <div className="p-5">
              <div className="text-xs font-medium text-gray-500 mb-1">{c.category}</div>
              <h3 className="font-bold text-gray-900 mb-3 line-clamp-2">{c.title}</h3>
              <div className="flex items-center gap-3 text-xs text-gray-500 mb-3">
                <div className="flex items-center gap-1"><BookOpen size={11} /> {c.lessons} lessons</div>
                <div className="flex items-center gap-1"><Clock size={11} /> {c.duration}</div>
              </div>

              {/* Progress */}
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-gray-500">Progress</span>
                <span className="font-bold text-gray-900">{c.progress}%</span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${c.progress}%` }}
                  transition={{ duration: 0.8, delay: 0.2 + i * 0.04, ease: "easeOut" }}
                  className={`h-full rounded-full ${c.progress === 100 ? "bg-emerald-500" : "bg-primary"}`}
                />
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={`mt-4 w-full py-2.5 rounded-xl text-sm font-semibold transition-colors ${c.progress === 100 ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" : c.progress > 0 ? "bg-primary text-white hover:bg-primary/90 shadow-md shadow-primary/30" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
              >
                {c.progress === 100 ? <span className="flex items-center justify-center gap-1.5"><Award size={14} /> View Certificate</span> : c.progress > 0 ? "Continue Learning" : "Start Course"}
              </motion.button>
            </div>
          </motion.div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16 text-sm text-gray-400">No courses match your search.</div>
      )}
    </DashboardLayout>
  );
}
