import { useState, useRef, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Search, MoreVertical, Edit2, Trash2, UserPlus, X,
  Calendar, ExternalLink, CheckCircle2,
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import Pagination, { usePagination } from "@/components/Pagination";
import type { Role } from "@/lib/roles";
import {
  useListJobs,
  useCreateJob,
  useUpdateJob,
  useDeleteJob,
  useListAssignableUsers,
  getListJobsQueryKey,
  ApiError,
  type Job as ApiJob,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  statusToUi, priorityToUi, formatShortDate,
  STATUS_UI_TO_API, PRIORITY_UI_TO_API,
  type UiStatus, type UiPriority,
} from "@/lib/jobMappers";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

interface UiJob {
  id: string;          // server uuid
  number: string;      // JOB-1042
  title: string;
  client: string;
  assignee: string;
  assigneeId: string | null;
  status: UiStatus;
  priority: UiPriority;
  created: string;
  due: string;
  completed?: string;
  progress: number;
}

function mapJob(j: ApiJob): UiJob {
  return {
    id: j.id,
    number: j.number,
    title: j.title,
    client: j.client,
    assignee: j.assignee?.name ?? "Unassigned",
    assigneeId: j.assignee?.id ?? null,
    status: statusToUi(j),
    priority: priorityToUi(j.priority),
    created: formatShortDate(j.createdAt),
    due: j.dueDate ? formatShortDate(j.dueDate) : "TBD",
    completed: j.completedAt ? formatShortDate(j.completedAt) : undefined,
    progress: j.progress,
  };
}

const STATUS_CONFIG: Record<UiStatus, { color: string; bg: string }> = {
  "Pending": { color: "text-amber-700", bg: "bg-amber-50 border-amber-200" },
  "In Progress": { color: "text-primary", bg: "bg-primary/10 border-primary/20" },
  "Completed": { color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
  "Overdue": { color: "text-red-700", bg: "bg-red-50 border-red-200" },
  "Rework": { color: "text-purple-700", bg: "bg-purple-50 border-purple-200" },
};

const PRIORITY_CONFIG: Record<UiPriority, { color: string; dot: string }> = {
  Low: { color: "text-gray-600", dot: "bg-gray-400" },
  Medium: { color: "text-amber-600", dot: "bg-amber-500" },
  High: { color: "text-red-600", dot: "bg-red-500" },
};

interface FormState {
  title: string;
  client: string;
  address: string;
  description: string;
  assigneeId: string;
  priority: UiPriority;
  due: string;
}

const EMPTY_FORM: FormState = {
  title: "",
  client: "",
  address: "",
  description: "",
  assigneeId: "",
  priority: "Medium",
  due: "",
};

type ChecklistTemplateItem = {
  text: string;
  desc?: string;
  attachmentRequired?: boolean;
};

function parseJobMeta(raw: ApiJob["description"]): { descriptionText: string; checklist: ChecklistTemplateItem[] } {
  if (!raw) return { descriptionText: "", checklist: [] };
  if (typeof raw !== "string") return { descriptionText: "", checklist: [] };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return { descriptionText: raw, checklist: [] };
    const obj = parsed as Record<string, unknown>;
    const descriptionText = typeof obj.descriptionText === "string" ? obj.descriptionText : raw;
    const checklistRaw = Array.isArray(obj.checklist) ? obj.checklist : [];
    const checklist: ChecklistTemplateItem[] = checklistRaw
      .map((x) => {
        if (!x || typeof x !== "object") return null;
        const i = x as Record<string, unknown>;
        const text = typeof i.text === "string" ? i.text.trim() : "";
        if (!text) return null;
        const desc = typeof i.desc === "string" && i.desc.trim() ? i.desc.trim() : undefined;
        const attachmentRequired = Boolean(i.attachmentRequired);
        const item: ChecklistTemplateItem = {
          text,
          ...(desc ? { desc } : {}),
          ...(attachmentRequired ? { attachmentRequired: true } : {}),
        };
        return item;
      })
      .filter((x): x is ChecklistTemplateItem => x != null);
    return { descriptionText, checklist };
  } catch {
    return { descriptionText: raw, checklist: [] };
  }
}

export default function JobManagement(
  { role = "super-admin" as Role, initialTab }: { role?: Role; initialTab?: "assignments" | "rework" } = {},
) {
  const [, setLocation] = useLocation();
  const basePath =
    role === "supervisor" ? "/supervisor/jobs"
    : role === "user" ? "/user/jobs"
    : role === "admin" ? "/admin/jobs"
    : "/super-admin/jobs";

  const qc = useQueryClient();
  const jobsQuery = useListJobs();
  const assignablesQuery = useListAssignableUsers();
  const createMutation = useCreateJob();
  const updateMutation = useUpdateJob();
  const deleteMutation = useDeleteJob();

  const invalidateJobs = () => qc.invalidateQueries({ queryKey: getListJobsQueryKey() });

  const jobs: UiJob[] = useMemo(
    () => (jobsQuery.data ?? []).map(mapJob),
    [jobsQuery.data],
  );
  const assignables = assignablesQuery.data ?? [];

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"All" | UiStatus>(initialTab === "rework" ? "Rework" : "All");
  const [assignmentFilter, setAssignmentFilter] = useState<"all" | "unassigned">(initialTab === "assignments" ? "unassigned" : "all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [reassignFor, setReassignFor] = useState<UiJob | null>(null);
  const [reassignTo, setReassignTo] = useState<string>("");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [jobFiles, setJobFiles] = useState<File[]>([]);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [checklistTemplate, setChecklistTemplate] = useState<ChecklistTemplateItem[]>([]);
  const [checkText, setCheckText] = useState("");
  const [checkDesc, setCheckDesc] = useState("");
  const [checkNeedsFile, setCheckNeedsFile] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const startEdit = (j: UiJob) => {
    const raw = (jobsQuery.data ?? []).find((x) => x.id === j.id);
    const meta = parseJobMeta(raw?.description ?? null);
    setEditingId(j.id);
    setForm({
      title: j.title,
      client: j.client,
      address: raw?.address ?? "",
      description: meta.descriptionText,
      assigneeId: j.assigneeId ?? "",
      priority: j.priority,
      due: raw?.dueDate ? String(raw.dueDate).slice(0, 10) : "",
    });
    setJobFiles([]);
    setMemberIds([]);
    setChecklistTemplate(meta.checklist);
    setCheckText("");
    setCheckDesc("");
    setCheckNeedsFile(false);
    setUploadingFiles(false);
    setError(null);
    setModalOpen(true);
    setOpenId(null);

    fetch(`/api/jobs/${j.id}/members`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (!Array.isArray(data)) return;
        const extras = (data as any[])
          .filter((p) => p && typeof p.id === "string" && p.role === "user" && p.id !== (j.assigneeId ?? ""))
          .map((p) => p.id as string);
        setMemberIds(extras);
      })
      .catch(() => {});
  };
  const startReassign = (j: UiJob) => {
    setReassignFor(j);
    setReassignTo(j.assigneeId ?? "");
    setOpenId(null);
  };
  const saveReassign = async () => {
    if (!reassignFor) return;
    try {
      await updateMutation.mutateAsync({
        id: reassignFor.id,
        data: { assigneeId: reassignTo || null },
      });
      await invalidateJobs();
      setReassignFor(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to reassign job");
    }
  };

  const formatSize = (bytes: number) =>
    bytes < 1024 ? `${bytes} B`
    : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  const onFilesPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    if (picked.length === 0) return;
    setJobFiles([...jobFiles, ...picked]);
    e.target.value = "";
  };
  const removeJobFile = (idx: number) => {
    setJobFiles(jobFiles.filter((_, i) => i !== idx));
  };
  const addChecklistItem = () => {
    const text = checkText.trim();
    if (!text) return;
    const desc = checkDesc.trim() ? checkDesc.trim() : undefined;
    setChecklistTemplate([
      ...checklistTemplate,
      { text, desc, attachmentRequired: checkNeedsFile || undefined },
    ]);
    setCheckText("");
    setCheckDesc("");
    setCheckNeedsFile(false);
  };
  const removeChecklistItem = (idx: number) => {
    setChecklistTemplate(checklistTemplate.filter((_, i) => i !== idx));
  };

  const filtered = jobs.filter((j) =>
    (filter === "All" || j.status === filter) &&
    (assignmentFilter === "all" || j.assigneeId === null) &&
    (j.title.toLowerCase().includes(search.toLowerCase()) ||
      j.client.toLowerCase().includes(search.toLowerCase()) ||
      j.number.toLowerCase().includes(search.toLowerCase()))
  );
  const { page, setPage, totalPages, pageItems, total, pageSize } = usePagination(filtered, 8);

  const remove = async (id: string) => {
    setOpenId(null);
    try {
      await deleteMutation.mutateAsync({ id });
      await invalidateJobs();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete job");
    }
  };

  const markCompleted = async (j: UiJob) => {
    setOpenId(null);
    try {
      await updateMutation.mutateAsync({
        id: j.id,
        data: { status: STATUS_UI_TO_API.Completed as any },
      });
      await invalidateJobs();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to mark job completed");
    }
  };

  const submit = async () => {
    if (!form.title || !form.client) {
      setError("Title and client are required");
      return;
    }
    setError(null);
    const descriptionPayload =
      form.description.trim() || checklistTemplate.length > 0
        ? JSON.stringify({
            descriptionText: form.description.trim(),
            checklist: checklistTemplate,
          })
        : undefined;
    const payload = {
      title: form.title,
      client: form.client,
      address: form.address || undefined,
      description: descriptionPayload,
      priority: PRIORITY_UI_TO_API[form.priority],
      assigneeId: form.assigneeId || null,
      dueDate: form.due ? new Date(form.due).toISOString() : null,
    };

    const syncMembers = async (jobId: string) => {
      const assigneeId = payload.assigneeId;
      const desired = Array.from(new Set(memberIds.filter((id) => id && id !== assigneeId)));
      try {
        const res = await fetch(`/api/jobs/${jobId}/members`, { credentials: "include" });
        const current = res.ok ? ((await res.json()) as any) : [];
        const currentUserExtras: string[] = Array.isArray(current)
          ? current
              .filter((p) => p && typeof p.id === "string" && p.role === "user" && p.id !== assigneeId)
              .map((p) => p.id as string)
          : [];
        const currentSet = new Set(currentUserExtras);
        const desiredSet = new Set(desired);

        for (const id of currentUserExtras) {
          if (!desiredSet.has(id)) {
            await fetch(`/api/jobs/${jobId}/members/${id}`, { method: "DELETE", credentials: "include" });
          }
        }
        for (const id of desired) {
          if (!currentSet.has(id)) {
            await fetch(`/api/jobs/${jobId}/members`, {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ userId: id }),
            });
          }
        }
      } catch {
      }
    };

    const uploadAllFiles = async (jobId: string) => {
      if (jobFiles.length === 0) return;
      setUploadingFiles(true);
      try {
        for (const file of jobFiles) {
          const fd = new FormData();
          fd.append("file", file);
          const res = await fetch(`/api/jobs/${jobId}/attachments`, {
            method: "POST",
            body: fd,
            credentials: "include",
          });
          if (!res.ok) {
            const text = await res.text();
            throw new Error(text || `Upload failed (${res.status})`);
          }
        }
      } finally {
        setUploadingFiles(false);
      }
    };

    try {
      if (editingId !== null) {
        await updateMutation.mutateAsync({ id: editingId, data: payload });
        await uploadAllFiles(editingId);
        await syncMembers(editingId);
      } else {
        const created = await createMutation.mutateAsync({ data: payload });
        await uploadAllFiles(created.id);
        await syncMembers(created.id);
      }
      await invalidateJobs();
      setForm(EMPTY_FORM);
      setJobFiles([]);
      setMemberIds([]);
      setChecklistTemplate([]);
      setCheckText("");
      setCheckDesc("");
      setCheckNeedsFile(false);
      setUploadingFiles(false);
      setEditingId(null);
      setModalOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Failed to save job");
    }
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
    setChecklistTemplate([]);
    setCheckText("");
    setCheckDesc("");
    setCheckNeedsFile(false);
    setJobFiles([]);
    setMemberIds([]);
    setUploadingFiles(false);
    setError(null);
  };

  const counts = {
    All: jobs.length,
    "Pending": jobs.filter((j) => j.status === "Pending").length,
    "In Progress": jobs.filter((j) => j.status === "In Progress").length,
    "Completed": jobs.filter((j) => j.status === "Completed").length,
    "Overdue": jobs.filter((j) => j.status === "Overdue").length,
    "Rework": jobs.filter((j) => j.status === "Rework").length,
  };

  const isSaving = createMutation.isPending || updateMutation.isPending || uploadingFiles;

  return (
    <DashboardLayout title="Job Management" role={role}>
      {(role === "super-admin" || role === "admin") && (
        <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-5 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
          <div className="text-sm font-bold text-gray-900">Quick filters</div>
          <div className="flex gap-2">
            <button
              onClick={() => setAssignmentFilter((v) => (v === "unassigned" ? "all" : "unassigned"))}
              className={`px-3 py-2 rounded-xl text-xs font-bold border transition-colors ${
                assignmentFilter === "unassigned"
                  ? "bg-primary text-white border-primary"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
              }`}
            >
              {assignmentFilter === "unassigned" ? "Showing Unassigned" : "Unassigned Only"}
            </button>
          </div>
        </div>
      )}

      {/* Status pills */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
        {(["All", "Pending", "In Progress", "Completed", "Overdue", "Rework"] as const).map((s, i) => (
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
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search jobs by title or client…" className="bg-transparent !text-gray-900 !placeholder:text-gray-400 text-sm flex-1 focus:outline-none" />
          </div>
          {role !== "user" && (
            <motion.button
              whileHover={{ scale: 1.04, y: -1 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => { setForm({ ...EMPTY_FORM, assigneeId: assignables[0]?.id ?? "" }); setEditingId(null); setChecklistTemplate([]); setCheckText(""); setCheckDesc(""); setCheckNeedsFile(false); setJobFiles([]); setMemberIds([]); setUploadingFiles(false); setError(null); setModalOpen(true); }}
              className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white px-5 py-2.5 rounded-xl font-medium text-sm shadow-lg shadow-primary/30 transition-colors"
            >
              <Plus size={16} /> Create Job
            </motion.button>
          )}
        </div>

        {error && (
          <div className="px-5 py-3 bg-red-50 border-b border-red-100 text-sm text-red-700">{error}</div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {["Job", "Assignee", "Priority", "Status", "Progress", "Timeline", ""].map((h) => (
                  <th key={h} className="text-left px-6 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {pageItems.map((j, i) => {
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
                      <td className="px-6 py-4 cursor-pointer" onClick={() => setLocation(`${basePath}/${j.id}`)}>
                        <div className="font-medium text-gray-900 text-sm flex items-center gap-1.5 group-hover:text-primary">{j.title} <ExternalLink size={11} className="text-gray-300" /></div>
                        <div className="text-xs text-gray-500 mt-0.5">{j.number} · {j.client} · <span className="text-gray-400">Created {j.created}</span></div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary to-sky-700 text-white text-[10px] font-bold flex items-center justify-center">
                            {j.assignee.split(" ").map((s) => s[0]).join("").slice(0, 2)}
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
                        {j.status === "Completed" && j.completed ? (
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                            <CheckCircle2 size={12} className="text-emerald-500" />
                            Done {j.completed}
                          </div>
                        ) : (
                          <div className={`flex items-center gap-1.5 text-xs ${j.status === "Overdue" ? "text-red-600 font-semibold" : "text-gray-600"}`}>
                            <Calendar size={12} className={j.status === "Overdue" ? "text-red-500" : "text-gray-400"} />
                            {j.status === "Overdue" ? "Was due " : "Due "}{j.due}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <motion.button
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.9 }}
                              className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                            >
                              <MoreVertical size={16} />
                            </motion.button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem asChild>
                              <Link href={`${basePath}/${j.id}`} className="flex items-center">
                                <ExternalLink size={14} className="mr-2 text-gray-400" />
                                View / Track
                              </Link>
                            </DropdownMenuItem>
                            {role !== "user" && (
                              <>
                                <DropdownMenuItem onClick={() => startEdit(j)}>
                                  <Edit2 size={14} className="mr-2 text-gray-400" />
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => startReassign(j)}>
                                  <UserPlus size={14} className="mr-2 text-gray-400" />
                                  Reassign
                                </DropdownMenuItem>
                                {(role === "admin" || role === "super-admin") && j.status !== "Completed" && (
                                  <DropdownMenuItem onClick={() => markCompleted(j)}>
                                    <CheckCircle2 size={14} className="mr-2 text-gray-400" />
                                    Mark Completed
                                  </DropdownMenuItem>
                                )}
                                {(role === "admin" || role === "super-admin") && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => remove(j.id)} className="text-red-600 focus:text-red-600 focus:bg-red-50">
                                      <Trash2 size={14} className="mr-2" />
                                      Delete
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
            </tbody>
          </table>
          {jobsQuery.isLoading && <div className="text-center py-12 text-sm text-gray-400">Loading jobs…</div>}
          {!jobsQuery.isLoading && filtered.length === 0 && <div className="text-center py-12 text-sm text-gray-400">No jobs found.</div>}
        </div>
        <Pagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} onChange={setPage} label="jobs" />
      </motion.div>

      {/* Create / Edit Job Modal */}
      <AnimatePresence>
        {modalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={closeModal} className="absolute inset-0 bg-black/50" />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} transition={{ type: "spring", stiffness: 300, damping: 28 }} className="relative w-full max-w-4xl max-h-[90vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">
              <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-primary/5 to-sky-50 shrink-0">
                <div>
                  <h3 className="font-bold text-gray-900 text-base">{editingId !== null ? "Edit Job" : "Create New Job"}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{editingId !== null ? "Update job details" : "Assign a new job to a team member"}</p>
                </div>
                <button onClick={closeModal} className="p-1.5 rounded-lg hover:bg-gray-100"><X size={16} /></button>
              </div>
              {error && (
                <div className="px-6 py-3 bg-red-50 border-b border-red-100 text-sm text-red-700 shrink-0">{error}</div>
              )}
              <div className="px-6 py-5 grid md:grid-cols-2 gap-x-6 gap-y-4 overflow-y-auto">
                {/* LEFT COLUMN — Job details */}
                <div className="space-y-4">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Job Details</div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">Job Title</label>
                    <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Structural Inspection" className="w-full px-4 py-2.5 bg-gray-50 border-2 border-gray-200 rounded-xl text-sm !text-gray-900 !placeholder:text-gray-400 focus:outline-none focus:border-primary focus:bg-white transition-colors" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">Client</label>
                      <input value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} placeholder="e.g. Anderson Residence" className="w-full px-3 py-2.5 bg-gray-50 border-2 border-gray-200 rounded-xl text-sm !text-gray-900 !placeholder:text-gray-400 focus:outline-none focus:border-primary focus:bg-white transition-colors" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">Assignee</label>
                      <select value={form.assigneeId} onChange={(e) => setForm({ ...form, assigneeId: e.target.value })} className="w-full px-3 py-2.5 bg-gray-50 border-2 border-gray-200 rounded-xl text-sm !text-gray-900 focus:outline-none focus:border-primary focus:bg-white transition-colors">
                        <option value="">Unassigned</option>
                        {assignables.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">Additional Workers</label>
                    <div className="rounded-xl border-2 border-gray-200 bg-gray-50 p-2 max-h-40 overflow-y-auto">
                      {assignables.filter((u) => u.role === "user").length === 0 ? (
                        <div className="px-2 py-4 text-xs text-gray-400 text-center">No workers available</div>
                      ) : (
                        <div className="space-y-1">
                          {assignables.filter((u) => u.role === "user").map((u) => (
                            <label key={u.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white cursor-pointer">
                              <input
                                type="checkbox"
                                checked={memberIds.includes(u.id)}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  setMemberIds((prev) => checked ? Array.from(new Set([...prev, u.id])) : prev.filter((x) => x !== u.id));
                                }}
                                className="h-4 w-4"
                              />
                              <span className="text-sm text-gray-800">{u.name}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="text-[11px] text-gray-500 mt-1">{memberIds.length} selected</div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">Job Address</label>
                    <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="e.g. 120 Park Avenue, Sydney NSW 2000" className="w-full px-4 py-2.5 bg-gray-50 border-2 border-gray-200 rounded-xl text-sm !text-gray-900 !placeholder:text-gray-400 focus:outline-none focus:border-primary focus:bg-white transition-colors" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">Description</label>
                    <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Brief job scope..." rows={3} className="w-full px-4 py-2.5 bg-gray-50 border-2 border-gray-200 rounded-xl text-sm !text-gray-900 !placeholder:text-gray-400 focus:outline-none focus:border-primary focus:bg-white transition-colors resize-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">Estimated Completion</label>
                    <input type="date" value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} className="w-full px-3 py-2.5 bg-gray-50 border-2 border-gray-200 rounded-xl text-sm !text-gray-900 focus:outline-none focus:border-primary focus:bg-white transition-colors" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">Priority</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(["Low", "Medium", "High"] as UiPriority[]).map((p) => {
                        const cfg = PRIORITY_CONFIG[p];
                        const sel = form.priority === p;
                        return (
                          <motion.button key={p} whileHover={{ y: -2 }} whileTap={{ scale: 0.96 }} onClick={() => setForm({ ...form, priority: p })} className={`p-2.5 rounded-xl border-2 flex items-center justify-center gap-1.5 transition-colors ${sel ? "border-primary bg-primary/5" : "border-gray-200 hover:border-gray-300"}`}>
                            <div className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                            <span className={`text-xs font-semibold ${sel ? "text-primary" : "text-gray-700"}`}>{p}</span>
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* RIGHT COLUMN — Checklist */}
                <div className="space-y-4 md:border-l md:border-gray-100 md:pl-6">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Checklist</div>

                  <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                      <div className="text-xs font-bold text-gray-900">Items</div>
                      <div className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                        {checklistTemplate.length}
                      </div>
                    </div>
                    {checklistTemplate.length === 0 ? (
                      <div className="px-4 py-8 text-center text-xs text-gray-400">No checklist items yet</div>
                    ) : (
                      <div className="divide-y divide-gray-50">
                        {checklistTemplate.map((it, idx) => (
                          <div key={`${idx}-${it.text}`} className="px-4 py-3 flex items-start gap-3">
                            <div className="w-6 h-6 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-[11px] font-bold shrink-0">{idx + 1}</div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-semibold text-gray-900 truncate">{it.text}</div>
                              {it.desc && <div className="text-[11px] text-gray-500 mt-0.5">{it.desc}</div>}
                              {it.attachmentRequired && <div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">File required</div>}
                            </div>
                            <button onClick={() => removeChecklistItem(idx)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-xl border-2 border-gray-200 bg-gray-50 p-4 space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">Task Name</label>
                      <input value={checkText} onChange={(e) => setCheckText(e.target.value)} placeholder="e.g. Review Site Photos" className="w-full px-3 py-2.5 bg-white border-2 border-gray-200 rounded-xl text-sm !text-gray-900 !placeholder:text-gray-400 focus:outline-none focus:border-primary" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">Description (optional)</label>
                      <textarea value={checkDesc} onChange={(e) => setCheckDesc(e.target.value)} placeholder="What does success look like for this task?" rows={3} className="w-full px-3 py-2.5 bg-white border-2 border-gray-200 rounded-xl text-sm !text-gray-900 !placeholder:text-gray-400 focus:outline-none focus:border-primary resize-none" />
                    </div>
                    <label className="flex items-center gap-2 text-xs font-semibold text-gray-700">
                      <input type="checkbox" checked={checkNeedsFile} onChange={(e) => setCheckNeedsFile(e.target.checked)} className="h-4 w-4" />
                      File upload required
                    </label>
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={addChecklistItem}
                      className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold shadow-md shadow-primary/30"
                    >
                      <Plus size={14} /> Add Checklist Item
                    </motion.button>
                  </div>

                  <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Job Files</div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={onFilesPicked}
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.svg,.zip,.dwg,.dxf"
                  />
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => fileInputRef.current?.click()}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click(); }}
                    className="rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center cursor-pointer transition-colors hover:bg-blue-50/40 hover:border-primary/40"
                  >
                    <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-2">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
                    </div>
                    <div className="text-xs font-semibold text-gray-700">Upload drawings, instructions, site photos, or client docs</div>
                    <div className="text-[10px] text-gray-500 mt-1">These appear in Job Detail → Files tab for the assigned user</div>
                  </div>
                  {jobFiles.length > 0 && (
                    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                        <div className="text-xs font-bold text-gray-900">Selected files</div>
                        <div className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/10 text-primary">{jobFiles.length}</div>
                      </div>
                      <div className="divide-y divide-gray-50 max-h-[220px] overflow-y-auto">
                        {jobFiles.map((f, idx) => (
                          <div key={`${f.name}-${f.size}-${idx}`} className="px-4 py-3 flex items-center gap-3">
                            <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center shrink-0 font-bold text-[10px]">FILE</div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-semibold text-gray-900 truncate">{f.name}</div>
                              <div className="text-[11px] text-gray-500">{formatSize(f.size)}</div>
                            </div>
                            <button onClick={() => removeJobFile(idx)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2 bg-gray-50 shrink-0">
                <button onClick={closeModal} className="px-4 py-2 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors">Cancel</button>
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  disabled={isSaving}
                  onClick={submit}
                  className="px-5 py-2 bg-primary hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-xl text-sm font-semibold shadow-md shadow-primary/30 transition-colors"
                >
                  {isSaving ? "Saving…" : editingId !== null ? "Save changes" : "Create Job"}
                </motion.button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Reassign Modal */}
      <AnimatePresence>
        {reassignFor && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setReassignFor(null)} className="absolute inset-0 bg-black/50" />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }} 
              animate={{ opacity: 1, scale: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.95, y: 20 }} 
              className="relative w-full max-w-md max-h-[90vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
            >
              <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between shrink-0">
                <div>
                  <h3 className="font-bold text-gray-900 text-base">Reassign Job</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{reassignFor.number} · {reassignFor.title}</p>
                </div>
                <button onClick={() => setReassignFor(null)} className="p-1.5 rounded-lg hover:bg-gray-100"><X size={16} /></button>
              </div>
              <div className="px-6 py-5 space-y-3 overflow-y-auto">
                <label className="block text-xs font-semibold text-gray-700">New Assignee</label>
                <select value={reassignTo} onChange={(e) => setReassignTo(e.target.value)} className="w-full px-3 py-2.5 bg-gray-50 border-2 border-gray-200 rounded-xl text-sm !text-gray-900 focus:outline-none focus:border-primary focus:bg-white">
                  <option value="">Unassigned</option>
                  {assignables.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
              <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2 bg-gray-50 shrink-0">
                <button onClick={() => setReassignFor(null)} className="px-4 py-2 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-100">Cancel</button>
                <button
                  disabled={updateMutation.isPending}
                  onClick={saveReassign}
                  className="px-5 py-2 bg-primary hover:bg-primary/90 disabled:opacity-60 text-white rounded-xl text-sm font-semibold shadow-md shadow-primary/30"
                >
                  {updateMutation.isPending ? "Saving…" : "Reassign"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </DashboardLayout>
  );
}
