import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Search, MoreVertical, Edit2, Trash2, UserPlus, X, Check,
  Calendar, Clock, AlertCircle,
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import type { Role } from "@/lib/roles";

type Status = "Pending" | "In Progress" | "Completed" | "Overdue";
type Priority = "Low" | "Medium" | "High";

interface Job {
  id: number;
  title: string;
  client: string;
  assignee: string;
  status: Status;
  priority: Priority;
  due: string;
  progress: number;
}

const STATUS_CONFIG: Record<Status, { color: string; bg: string }> = {
  "Pending": { color: "text-amber-700", bg: "bg-amber-50 border-amber-200" },
  "In Progress": { color: "text-primary", bg: "bg-primary/10 border-primary/20" },
  "Completed": { color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
  "Overdue": { color: "text-red-700", bg: "bg-red-50 border-red-200" },
};

const PRIORITY_CONFIG: Record<Priority, { color: string; dot: string }> = {
  Low: { color: "text-gray-600", dot: "bg-gray-400" },
  Medium: { color: "text-amber-600", dot: "bg-amber-500" },
  High: { color: "text-red-600", dot: "bg-red-500" },
};

const SEED: Job[] = [
  { id: 482, title: "Server Maintenance", client: "TechCorp Ltd", assignee: "Sarah Johnson", status: "In Progress", priority: "High", due: "Apr 22", progress: 72 },
  { id: 481, title: "Site Inspection - North", client: "BuildRight Co", assignee: "Mike Chen", status: "Pending", priority: "Medium", due: "Apr 25", progress: 0 },
  { id: 480, title: "Quarterly Audit", client: "FinSecure", assignee: "Emma Wilson", status: "Completed", priority: "High", due: "Apr 18", progress: 100 },
  { id: 479, title: "Plumbing Overhaul - Site B", client: "City Council", assignee: "David Park", status: "Overdue", priority: "High", due: "Apr 15", progress: 45 },
  { id: 478, title: "Electrical Inspection", client: "GreenEnergy", assignee: "Lisa Martinez", status: "In Progress", priority: "Low", due: "Apr 28", progress: 30 },
  { id: 477, title: "Annual Safety Audit", client: "MetroWorks", assignee: "James Bennett", status: "Pending", priority: "Medium", due: "May 02", progress: 0 },
];

export default function JobManagement({ role = "super-admin" as Role }: { role?: Role } = {}) {
  const [jobs, setJobs] = useState<Job[]>(SEED);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"All" | Status>("All");
  const [openId, setOpenId] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ title: "", client: "", assignee: "Sarah Johnson", priority: "Medium" as Priority, due: "" });

  const filtered = jobs.filter((j) =>
    (filter === "All" || j.status === filter) &&
    (j.title.toLowerCase().includes(search.toLowerCase()) || j.client.toLowerCase().includes(search.toLowerCase()))
  );

  const remove = (id: number) => { setJobs(jobs.filter((j) => j.id !== id)); setOpenId(null); };
  const create = () => {
    if (!form.title || !form.client) return;
    setJobs([{
      id: Math.max(...jobs.map((j) => j.id)) + 1,
      title: form.title, client: form.client, assignee: form.assignee,
      status: "Pending", priority: form.priority, due: form.due || "TBD", progress: 0,
    }, ...jobs]);
    setForm({ title: "", client: "", assignee: "Sarah Johnson", priority: "Medium", due: "" });
    setModalOpen(false);
  };

  const counts = {
    All: jobs.length,
    "Pending": jobs.filter((j) => j.status === "Pending").length,
    "In Progress": jobs.filter((j) => j.status === "In Progress").length,
    "Completed": jobs.filter((j) => j.status === "Completed").length,
    "Overdue": jobs.filter((j) => j.status === "Overdue").length,
  };

  return (
    <DashboardLayout title="Job Management" role={role}>
      {/* Status pills */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {(["All", "Pending", "In Progress", "Completed", "Overdue"] as const).map((s, i) => (
          <motion.button
            key={s}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            whileHover={{ y: -3, boxShadow: "0 12px 24px rgba(0,0,0,0.06)" }}
            onClick={() => setFilter(s)}
            className={`p-4 rounded-xl border-2 text-left transition-colors ${filter === s ? "border-primary bg-primary/5" : "border-gray-100 bg-white hover:border-gray-200"}`}
          >
            <div className={`text-xs font-medium ${filter === s ? "text-primary" : "text-gray-500"}`}>{s}</div>
            <div className="text-2xl font-bold text-gray-900 mt-1">{counts[s]}</div>
          </motion.button>
        ))}
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 flex-1 max-w-md focus-within:border-primary transition-colors">
            <Search size={16} className="text-gray-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search jobs by title or client…" className="bg-transparent text-sm flex-1 focus:outline-none" />
          </div>
          <motion.button
            whileHover={{ scale: 1.04, y: -1 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white px-5 py-2.5 rounded-xl font-medium text-sm shadow-lg shadow-primary/30 transition-colors"
          >
            <Plus size={16} /> Create Job
          </motion.button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {["Job", "Assignee", "Priority", "Status", "Progress", "Due", ""].map((h) => (
                  <th key={h} className="text-left px-6 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {filtered.map((j, i) => {
                  const sCfg = STATUS_CONFIG[j.status];
                  const pCfg = PRIORITY_CONFIG[j.priority];
                  return (
                    <motion.tr
                      key={j.id}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ delay: i * 0.03 }}
                      whileHover={{ backgroundColor: "rgb(249, 250, 251)" }}
                      className="border-b border-gray-50 last:border-0"
                    >
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-900 text-sm">{j.title}</div>
                        <div className="text-xs text-gray-500 mt-0.5">#{j.id} · {j.client}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary to-sky-700 text-white text-[10px] font-bold flex items-center justify-center">
                            {j.assignee.split(" ").map((s) => s[0]).join("")}
                          </div>
                          <span className="text-sm text-gray-700">{j.assignee}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5">
                          <div className={`w-1.5 h-1.5 rounded-full ${pCfg.dot}`} />
                          <span className={`text-xs font-medium ${pCfg.color}`}>{j.priority}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-lg border text-xs font-semibold ${sCfg.bg} ${sCfg.color}`}>
                          {j.status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 w-32">
                          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${j.progress}%` }}
                              transition={{ duration: 0.8, delay: i * 0.05, ease: "easeOut" }}
                              className={`h-full rounded-full ${j.status === "Completed" ? "bg-emerald-500" : j.status === "Overdue" ? "bg-red-500" : "bg-primary"}`}
                            />
                          </div>
                          <span className="text-xs font-semibold text-gray-600 w-8 text-right">{j.progress}%</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5 text-xs text-gray-600">
                          <Calendar size={12} className="text-gray-400" />
                          {j.due}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right relative">
                        <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => setOpenId(openId === j.id ? null : j.id)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700">
                          <MoreVertical size={16} />
                        </motion.button>
                        <AnimatePresence>
                          {openId === j.id && (
                            <motion.div initial={{ opacity: 0, scale: 0.95, y: -5 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: -5 }} transition={{ duration: 0.12 }} className="absolute right-6 top-12 w-44 bg-white rounded-xl shadow-xl border border-gray-100 z-10 py-1 text-left">
                              <button className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                                <Edit2 size={14} className="text-gray-400" /> Edit
                              </button>
                              <button className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                                <UserPlus size={14} className="text-gray-400" /> Reassign
                              </button>
                              <div className="h-px bg-gray-100 my-1" />
                              <button onClick={() => remove(j.id)} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50">
                                <Trash2 size={14} /> Delete
                              </button>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </td>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
            </tbody>
          </table>
          {filtered.length === 0 && <div className="text-center py-12 text-sm text-gray-400">No jobs found.</div>}
        </div>
      </motion.div>

      {/* Create Job Modal */}
      <AnimatePresence>
        {modalOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setModalOpen(false)} className="fixed inset-0 bg-black/50 z-40" />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} transition={{ type: "spring", stiffness: 300, damping: 28 }} className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md bg-white rounded-2xl shadow-2xl">
              <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-gray-900">Create New Job</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Assign a new job to a team member</p>
                </div>
                <button onClick={() => setModalOpen(false)} className="p-1.5 rounded-lg hover:bg-gray-100"><X size={16} /></button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Job Title</label>
                  <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Server Maintenance" className="w-full px-4 py-3 bg-gray-50 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:border-primary focus:bg-white transition-colors" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Client</label>
                  <input value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} placeholder="e.g. TechCorp Ltd" className="w-full px-4 py-3 bg-gray-50 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:border-primary focus:bg-white transition-colors" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">Assignee</label>
                    <select value={form.assignee} onChange={(e) => setForm({ ...form, assignee: e.target.value })} className="w-full px-3 py-3 bg-gray-50 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:border-primary focus:bg-white transition-colors">
                      {["Sarah Johnson", "Mike Chen", "Emma Wilson", "David Park", "Lisa Martinez"].map((n) => <option key={n}>{n}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">Due Date</label>
                    <input type="date" value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} className="w-full px-3 py-3 bg-gray-50 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:border-primary focus:bg-white transition-colors" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Priority</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(["Low", "Medium", "High"] as Priority[]).map((p) => {
                      const cfg = PRIORITY_CONFIG[p];
                      const sel = form.priority === p;
                      return (
                        <motion.button key={p} whileHover={{ y: -2 }} whileTap={{ scale: 0.96 }} onClick={() => setForm({ ...form, priority: p })} className={`p-3 rounded-xl border-2 flex items-center justify-center gap-1.5 transition-colors ${sel ? "border-primary bg-primary/5" : "border-gray-200 hover:border-gray-300"}`}>
                          <div className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                          <span className={`text-xs font-semibold ${sel ? "text-primary" : "text-gray-700"}`}>{p}</span>
                        </motion.button>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
                <button onClick={() => setModalOpen(false)} className="px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-xl">Cancel</button>
                <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }} onClick={create} className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white px-5 py-2.5 rounded-xl font-medium text-sm shadow-lg shadow-primary/30">
                  <Check size={16} /> Create Job
                </motion.button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </DashboardLayout>
  );
}
