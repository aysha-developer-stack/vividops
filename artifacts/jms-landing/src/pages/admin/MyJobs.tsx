import { useState, useMemo } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Calendar, ChevronRight, Briefcase,
  CheckCircle2, Clock, AlertCircle, MapPin, AlertTriangle,
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import Pagination, { usePagination } from "@/components/Pagination";
import { useListJobs, type Job as ApiJob } from "@workspace/api-client-react";
import {
  statusToUi, priorityToUi, formatShortDate, daysUntil,
  type UiStatus,
} from "@/lib/jobMappers";

interface UiJob {
  id: string;          // server uuid (used for routing)
  number: string;      // display number e.g. JOB-2148
  title: string;
  client: string;
  address: string;
  status: UiStatus;
  deadline: string;
  daysLeft: number;
  priority: "Low" | "Medium" | "High";
}

function mapJob(j: ApiJob): UiJob {
  const days = daysUntil(j.dueDate);
  const deadline = !j.dueDate
    ? "TBD"
    : days === 0
    ? "Today"
    : days === 1
    ? "Tomorrow"
    : formatShortDate(j.dueDate);
  return {
    id: j.id,
    number: j.number,
    title: j.title,
    client: j.client,
    address: j.address ?? "—",
    status: statusToUi(j),
    deadline,
    daysLeft: days,
    priority: priorityToUi(j.priority),
  };
}

const STATUS_CFG: Record<UiStatus, { color: string; icon: any; bar: string }> = {
  "Pending": { color: "bg-amber-50 text-amber-700 border-amber-200", icon: Clock, bar: "bg-amber-400" },
  "In Progress": { color: "bg-primary/10 text-primary border-primary/30", icon: Briefcase, bar: "bg-primary" },
  "Completed": { color: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: CheckCircle2, bar: "bg-emerald-400" },
  "Overdue": { color: "bg-red-50 text-red-700 border-red-200", icon: AlertCircle, bar: "bg-red-500" },
  "Rework": { color: "bg-purple-50 text-purple-700 border-purple-200", icon: AlertTriangle, bar: "bg-purple-500" },
};

const FILTERS: ("All" | UiStatus)[] = ["All", "Pending", "In Progress", "Completed", "Overdue", "Rework"];

export default function MyJobs() {
  const [filter, setFilter] = useState<"All" | UiStatus>("All");
  const [search, setSearch] = useState("");
  const jobsQuery = useListJobs();

  const jobs: UiJob[] = useMemo(
    () => (jobsQuery.data ?? []).map(mapJob),
    [jobsQuery.data],
  );

  const filtered = jobs.filter(
    (j) =>
      (filter === "All" || j.status === filter) &&
      (j.title.toLowerCase().includes(search.toLowerCase()) ||
        j.client.toLowerCase().includes(search.toLowerCase())),
  );
  const { page, setPage, totalPages, pageItems, total, pageSize } = usePagination(filtered, 5);

  return (
    <DashboardLayout title="My Jobs" role="user">
      {/* Stats summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {(["Pending", "In Progress", "Completed", "Overdue", "Rework"] as UiStatus[]).map((s, i) => {
          const count = jobs.filter((j) => j.status === s).length;
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

      {/* Loading / empty states */}
      {jobsQuery.isLoading && (
        <div className="text-center py-16 text-sm text-gray-400">Loading jobs…</div>
      )}
      {jobsQuery.isError && (
        <div className="text-center py-16 text-sm text-red-500">
          Could not load jobs. Please refresh.
        </div>
      )}

      {/* Job list */}
      {!jobsQuery.isLoading && !jobsQuery.isError && (
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
                        {j.number?.includes("-") ? j.number.split("-")[1]?.slice(-2) : (j.number?.slice(-2) ?? "—")}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1 flex-wrap">
                          <div>
                            <div className="font-bold text-gray-900">{j.title}</div>
                            <div className="text-xs text-gray-500 mt-0.5">{j.number} · {j.client}</div>
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
      )}

      {!jobsQuery.isLoading && filtered.length === 0 && (
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

