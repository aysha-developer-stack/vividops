import { useState } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Calendar, ChevronRight, Briefcase, Filter,
  CheckCircle2, Clock, AlertCircle, MapPin,
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import Pagination, { usePagination } from "@/components/Pagination";

type Status = "Pending" | "In Progress" | "Completed" | "Overdue";

interface Job {
  id: string;
  title: string;
  client: string;
  address: string;
  status: Status;
  deadline: string;
  daysLeft: number;
  priority: "Low" | "Medium" | "High";
}

const JOBS: Job[] = [
  { id: "JOB-2148", title: "Structural Inspection", client: "Wilkinson Residence", address: "12 Oak St, Mosman NSW", status: "In Progress", deadline: "Today, 5pm", daysLeft: 0, priority: "High" },
  { id: "JOB-2150", title: "Pre-Purchase Inspection", client: "Patel Residence", address: "45 Eucalyptus Rd, Hawthorn VIC", status: "In Progress", deadline: "Tomorrow", daysLeft: 1, priority: "Medium" },
  { id: "JOB-2151", title: "Footing Design Review", client: "Greenfield Builders", address: "8 Banksia Cres", status: "Pending", deadline: "Apr 24", daysLeft: 4, priority: "Medium" },
  { id: "JOB-2155", title: "Crack Assessment", client: "Thompson Residence", address: "27 Birchwood Rd", status: "Pending", deadline: "Apr 25", daysLeft: 5, priority: "High" },
  { id: "JOB-2147", title: "Footing Inspection", client: "Patel Residence", address: "12 King St, Parramatta", status: "Completed", deadline: "Apr 18", daysLeft: -2, priority: "Low" },
  { id: "JOB-2120", title: "Slab Design", client: "Carter Residence", address: "55 Magnolia Ave", status: "Overdue", deadline: "Apr 18", daysLeft: -2, priority: "High" },
];

const STATUS_CFG: Record<Status, { color: string; icon: any; bar: string }> = {
  "Pending": { color: "bg-amber-50 text-amber-700 border-amber-200", icon: Clock, bar: "bg-amber-400" },
  "In Progress": { color: "bg-primary/10 text-primary border-primary/30", icon: Briefcase, bar: "bg-primary" },
  "Completed": { color: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: CheckCircle2, bar: "bg-emerald-400" },
  "Overdue": { color: "bg-red-50 text-red-700 border-red-200", icon: AlertCircle, bar: "bg-red-500" },
};

const FILTERS: ("All" | Status)[] = ["All", "Pending", "In Progress", "Completed", "Overdue"];

export default function MyJobs() {
  const [filter, setFilter] = useState<"All" | Status>("All");
  const [search, setSearch] = useState("");

  const filtered = JOBS.filter((j) => (filter === "All" || j.status === filter) && (j.title.toLowerCase().includes(search.toLowerCase()) || j.client.toLowerCase().includes(search.toLowerCase())));
  const { page, setPage, totalPages, pageItems, total, pageSize } = usePagination(filtered, 5);

  return (
    <DashboardLayout title="My Jobs" role="user">
      {/* Stats summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {(["Pending", "In Progress", "Completed", "Overdue"] as Status[]).map((s, i) => {
          const count = JOBS.filter((j) => j.status === s).length;
          const cfg = STATUS_CFG[s];
          const Icon = cfg.icon;
          return (
            <motion.button
              key={s}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              whileHover={{ y: -3 }}
              onClick={() => setFilter(s)}
              className={`text-left p-4 rounded-2xl bg-white border-2 transition-all ${filter === s ? "border-primary shadow-md" : "border-gray-100"}`}
            >
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-8 h-8 rounded-lg ${cfg.color.replace("border-", "ring-1 ring-")} flex items-center justify-center`}>
                  <Icon size={14} />
                </div>
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{s}</span>
              </div>
              <div className="text-2xl font-bold text-gray-900">{count}</div>
            </motion.button>
          );
        })}
      </div>

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between mb-5">
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-2.5 max-w-md flex-1 focus-within:border-primary transition-colors">
          <Search size={16} className="text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by job, client…" className="bg-transparent text-sm flex-1 focus:outline-none" />
        </div>
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl overflow-x-auto">
          {FILTERS.map((f) => (
            <motion.button
              key={f}
              whileTap={{ scale: 0.96 }}
              onClick={() => setFilter(f)}
              className={`relative px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap transition-colors ${filter === f ? "text-white" : "text-gray-600 hover:text-gray-900"}`}
            >
              {filter === f && <motion.div layoutId="myJobsFilter" className="absolute inset-0 bg-primary rounded-lg pointer-events-none" transition={{ type: "spring", stiffness: 350, damping: 28 }} />}
              <span className="relative">{f}</span>
            </motion.button>
          ))}
        </div>
      </div>

      {/* Job list */}
      <div className="space-y-3">
        <AnimatePresence>
          {pageItems.map((j, i) => {
            const cfg = STATUS_CFG[j.status];
            const Icon = cfg.icon;
            return (
              <Link key={j.id} href={`/user/jobs/${j.id}`}>
                <motion.div
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ delay: i * 0.04 }}
                  whileHover={{ x: 4, boxShadow: "0 12px 24px rgba(0,0,0,0.07)" }}
                  className="relative bg-white border border-gray-100 rounded-2xl p-5 cursor-pointer overflow-hidden group"
                >
                  <div className={`absolute left-0 top-0 bottom-0 w-1 ${cfg.bar}`} />
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/10 to-sky-100 text-primary flex items-center justify-center font-bold text-sm shrink-0">
                      {j.id.split("-")[1].slice(-2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1 flex-wrap">
                        <div>
                          <div className="font-bold text-gray-900">{j.title}</div>
                          <div className="text-xs text-gray-500 mt-0.5">{j.id} · {j.client}</div>
                        </div>
                        <span className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded-full border flex items-center gap-1 ${cfg.color}`}>
                          <Icon size={10} /> {j.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-gray-500 mt-3 flex-wrap">
                        <div className="flex items-center gap-1.5"><MapPin size={12} />{j.address}</div>
                        <div className="flex items-center gap-1.5"><Calendar size={12} />Due {j.deadline}</div>
                        {j.daysLeft >= 0 && j.daysLeft <= 1 && (
                          <span className="text-xs font-bold text-amber-600">⏰ {j.daysLeft === 0 ? "Today" : "Tomorrow"}</span>
                        )}
                        {j.daysLeft < 0 && j.status !== "Completed" && (
                          <span className="text-xs font-bold text-red-600">{Math.abs(j.daysLeft)}d overdue</span>
                        )}
                      </div>
                    </div>
                    <ChevronRight size={18} className="text-gray-300 group-hover:text-primary group-hover:translate-x-1 transition-all shrink-0 mt-1" />
                  </div>
                </motion.div>
              </Link>
            );
          })}
        </AnimatePresence>
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16 text-sm text-gray-400">No jobs match your filter.</div>
      )}

      {filtered.length > 0 && (
        <div className="mt-4 bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <Pagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} onChange={setPage} label="jobs" />
        </div>
      )}
    </DashboardLayout>
  );
}
