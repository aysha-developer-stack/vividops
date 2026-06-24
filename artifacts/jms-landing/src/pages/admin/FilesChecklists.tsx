import { useState, useMemo } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Calendar, ChevronRight, Briefcase,
  CheckCircle2, Clock, AlertTriangle, MapPin, 
  Folder, ListChecks, FileText, Upload, Download, Eye
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import Pagination, { usePagination } from "@/components/Pagination";
import { useListJobs, type Job as ApiJob } from "@workspace/api-client-react";
import {
  statusToUi, priorityToUi, formatShortDate, daysUntil,
  type UiStatus,
} from "@/lib/jobMappers";

interface UiJob {
  id: string;
  number: string;
  title: string;
  client: string;
  address: string;
  status: UiStatus;
  deadline: string;
  daysLeft: number;
  priority: "Low" | "Medium" | "High";
  progress: number;
  fileCount: number;
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
    progress: j.progress ?? 0,
    fileCount: 3, // Mocking file count as it's not in ApiJob
  };
}

const STATUS_CFG: Record<UiStatus, { color: string; icon: any; bar: string }> = {
  "Pending": { color: "bg-amber-50 text-amber-700 border-amber-200", icon: Clock, bar: "bg-amber-400" },
  "In Progress": { color: "bg-primary/10 text-primary border-primary/30", icon: Briefcase, bar: "bg-primary" },
  "Completed": { color: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: CheckCircle2, bar: "bg-emerald-400" },
  "Overdue": { color: "bg-red-50 text-red-700 border-red-200", icon: Clock, bar: "bg-red-500" },
  "Rework": { color: "bg-purple-50 text-purple-700 border-purple-200", icon: AlertTriangle, bar: "bg-purple-500" },
};

export default function FilesChecklists() {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"checklists" | "files">("checklists");
  const jobsQuery = useListJobs();

  const jobs: UiJob[] = useMemo(
    () => (jobsQuery.data ?? []).map(mapJob),
    [jobsQuery.data],
  );

  const filtered = jobs.filter(
    (j) =>
      (j.title.toLowerCase().includes(search.toLowerCase()) ||
        j.client.toLowerCase().includes(search.toLowerCase()) ||
        j.number.toLowerCase().includes(search.toLowerCase())),
  );

  const { page, setPage, totalPages, pageItems, total, pageSize } = usePagination(filtered, 5);

  return (
    <DashboardLayout title="Files & Checklists" role="user">
      {/* Search & Tabs */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between mb-6">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
          <button 
            onClick={() => setActiveTab("checklists")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${activeTab === "checklists" ? "bg-white text-primary shadow-sm" : "text-gray-500 hover:text-gray-900"}`}
          >
            <ListChecks size={14} /> Checklists
          </button>
          <button 
            onClick={() => setActiveTab("files")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${activeTab === "files" ? "bg-white text-primary shadow-sm" : "text-gray-500 hover:text-gray-900"}`}
          >
            <Folder size={14} /> All Files
          </button>
        </div>

        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input 
            type="text" 
            placeholder="Search by job or client..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm !text-gray-900 !placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>

      {/* Content */}
      <div className="space-y-4">
        {jobsQuery.isLoading && (
          <div className="text-center py-20 text-gray-400">Loading your data...</div>
        )}

        {!jobsQuery.isLoading && pageItems.length === 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-gray-50 flex items-center justify-center text-gray-300 mx-auto mb-4">
              {activeTab === "checklists" ? <ListChecks size={32} /> : <Folder size={32} />}
            </div>
            <h3 className="text-gray-900 font-bold">No {activeTab} found</h3>
            <p className="text-gray-500 text-sm mt-1">Try adjusting your search or check your active jobs.</p>
          </div>
        )}

        {!jobsQuery.isLoading && activeTab === "checklists" && pageItems.map((j, i) => (
          <motion.div
            key={j.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="bg-white rounded-2xl border border-gray-100 p-5 group hover:shadow-lg hover:shadow-gray-200/50 transition-all"
          >
            <div className="flex flex-col md:flex-row gap-5 items-start md:items-center">
              <div className="w-12 h-12 rounded-xl bg-primary/5 text-primary flex items-center justify-center font-bold text-sm shrink-0">
                {j.number.split("-")[1]?.slice(-2) ?? "??"}
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between mb-1">
                  <div>
                    <h4 className="font-bold text-gray-900 group-hover:text-primary transition-colors">{j.title}</h4>
                    <p className="text-xs text-gray-500">{j.number} · {j.client}</p>
                  </div>
                  <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${STATUS_CFG[j.status].color}`}>
                    {j.status}
                  </span>
                </div>
                
                <div className="mt-4">
                  <div className="flex justify-between text-[10px] font-bold text-gray-500 uppercase mb-1.5">
                    <span>Checklist Progress</span>
                    <span className="text-primary">{j.progress}%</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <motion.div 
                      className="h-full bg-primary"
                      initial={{ width: 0 }}
                      animate={{ width: `${j.progress}%` }}
                      transition={{ duration: 1, ease: "easeOut" }}
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-2 w-full md:w-auto">
                <Link href={`/user/jobs/${j.id}?tab=checklist`} className="flex-1 md:flex-none">
                  <button className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-50 hover:bg-primary hover:text-white text-gray-600 rounded-xl text-xs font-bold transition-all border border-gray-100">
                    <ListChecks size={14} /> Open Checklist
                  </button>
                </Link>
                <Link href={`/user/jobs/${j.id}`} className="md:flex-none">
                  <button className="p-2 text-gray-400 hover:text-primary transition-colors">
                    <ChevronRight size={20} />
                  </button>
                </Link>
              </div>
            </div>
          </motion.div>
        ))}

        {!jobsQuery.isLoading && activeTab === "files" && pageItems.map((j, i) => (
          <motion.div
            key={j.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="bg-white rounded-2xl border border-gray-100 p-5 group hover:shadow-lg hover:shadow-gray-200/50 transition-all"
          >
            <div className="flex flex-col md:flex-row gap-5 items-start md:items-center">
              <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <Folder size={24} />
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between mb-1">
                  <div>
                    <h4 className="font-bold text-gray-900 group-hover:text-emerald-600 transition-colors">{j.title}</h4>
                    <p className="text-xs text-gray-500">{j.number} · {j.client}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="text-sm font-bold text-gray-900">{j.fileCount}</div>
                      <div className="text-[10px] text-gray-500 uppercase font-bold">Files</div>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-4 mt-3">
                  <div className="flex -space-x-2">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="w-6 h-6 rounded-lg bg-gray-100 border-2 border-white flex items-center justify-center">
                        <FileText size={10} className="text-gray-400" />
                      </div>
                    ))}
                  </div>
                  <span className="text-[10px] text-gray-400 font-medium">site_plan.pdf, measurements.xlsx +1 more</span>
                </div>
              </div>

              <div className="flex gap-2 w-full md:w-auto">
                <Link href={`/user/jobs/${j.id}?tab=files`} className="flex-1 md:flex-none">
                  <button className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-emerald-50 hover:bg-emerald-600 hover:text-white text-emerald-600 rounded-xl text-xs font-bold transition-all border border-emerald-100">
                    <Folder size={14} /> Manage Files
                  </button>
                </Link>
                <Link href={`/user/jobs/${j.id}`} className="md:flex-none">
                  <button className="p-2 text-gray-400 hover:text-primary transition-colors">
                    <ChevronRight size={20} />
                  </button>
                </Link>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {filtered.length > 0 && (
        <div className="mt-6 bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <Pagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} onChange={setPage} label="jobs" />
        </div>
      )}
    </DashboardLayout>
  );
}
