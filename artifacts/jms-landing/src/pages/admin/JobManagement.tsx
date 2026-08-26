import { useEffect, useState, useRef, useMemo } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Search, MoreVertical, Trash2, UserPlus, X,
  Calendar, ExternalLink, CheckCircle2, Download, Loader2, Clock, Pause, Play, ChevronRight,
} from "lucide-react";
import FileExtensionIcon from "@/components/FileExtensionIcon";
import DashboardLayout from "@/components/DashboardLayout";
import { useDashboardSearch } from "@/lib/pageSearch";
import Pagination, { usePagination } from "@/components/Pagination";
import type { Role } from "@/lib/roles";
import { useAuth } from "@/lib/auth";
import {
  useListJobs,
  useCreateJob,
  useUpdateJob,
  useDeleteJob,
  useListAssignableUsers,
  getListJobsQueryKey,
  getGetJobQueryKey,
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
  parseJobMeta,
  serializeJobMeta,
  type ChecklistTemplateItem,
} from "@/lib/jobMeta";
import { downloadNamedFile, jobAttachmentDownloadUrl } from "@/lib/downloadFile";
import FileDropzone from "@/components/FileDropzone";
import DescriptionInput, { AddressUrlHint } from "@/components/DescriptionInput";
import { CHECKLIST_FILE_ACCEPT, isChecklistDocFile, filterJobFiles, JOB_FILE_ACCEPT, JOB_FILE_REJECTED_MESSAGE } from "@/lib/collectDroppedFiles";
import { formatStoredFileSize, parseExistingJobAttachment, todayJobDateInput, type ExistingJobAttachment } from "@/lib/jobForm";
import { buildJobSaveUploadSpecs, uploadJobAttachmentsBatch } from "@/lib/uploadJobAttachmentsBatch";
import JobListSortControl from "@/components/JobListSortControl";
import {
  type JobListSortMode,
  readStoredJobListSort,
  sortJobs,
} from "@/lib/jobListSort";
import {
  fetchActiveReviewCheckSessions,
  liveReviewCheckElapsedSeconds,
  type ReviewCheckSession,
} from "@/lib/reviewCheckSessionApi";

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
  address: string | null;
  assignee: string;
  assignees: Array<{ id: string; name: string }>;
  assigneeId: string | null;
  supervisor: string | null;
  supervisorId: string | null;
  status: UiStatus;
  priority: UiPriority;
  created: string;
  createdAt: string;
  due: string;
  completed?: string;
  progress: number;
  reviewStartedAt?: string | null;
  updatedAt: string;
}

function formatReviewTime(seconds: number) {
  return `${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function ReviewTimerBadge({
  accumulatedSeconds,
  segmentStartedAt,
}: {
  accumulatedSeconds: number;
  segmentStartedAt: string;
}) {
  const [elapsed, setElapsed] = useState(() =>
    liveReviewCheckElapsedSeconds({ accumulatedSeconds, segmentStartedAt }),
  );

  useEffect(() => {
    const tick = () => {
      setElapsed(liveReviewCheckElapsedSeconds({ accumulatedSeconds, segmentStartedAt }));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [accumulatedSeconds, segmentStartedAt]);

  return (
    <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-mono font-semibold text-sky-700 bg-sky-50 border border-sky-200 rounded px-1.5 py-0.5">
      <Clock size={10} />
      {formatReviewTime(elapsed)}
    </span>
  );
}

function initialsForName(name: string) {
  return name.split(" ").map((s) => s[0]).join("").slice(0, 2);
}

function mapJob(j: ApiJob): UiJob {
  const assignees =
    j.assignees
      ?.filter((a) => a.role === "user")
      .map((a) => ({ id: a.id, name: a.name })) ??
    (j.assignee?.role === "user" ? [{ id: j.assignee.id, name: j.assignee.name }] : []);
  const primaryAssignee = j.assignee?.role === "user" ? j.assignee : assignees[0] ?? null;
  return {
    id: j.id,
    number: j.number,
    title: j.title,
    client: j.client,
    address: j.address ?? null,
    assignee: assignees.map((a) => a.name).join(", ") || "Unassigned",
    assignees,
    assigneeId: primaryAssignee?.id ?? null,
    supervisor: j.supervisor?.name ?? null,
    supervisorId: j.supervisor?.id ?? null,
    status: statusToUi(j),
    priority: priorityToUi(j.priority),
    created: formatShortDate(j.createdAt),
    createdAt: j.createdAt,
    due: j.dueDate ? formatShortDate(j.dueDate) : "TBD",
    completed: j.completedAt ? formatShortDate(j.completedAt) : undefined,
    progress: j.progress,
    reviewStartedAt: j.reviewStartedAt ?? null,
    updatedAt: j.updatedAt,
  };
}

const STATUS_CONFIG: Record<UiStatus, { color: string; bg: string }> = {
  "Not Started": { color: "text-amber-700", bg: "bg-amber-50 border-amber-200" },
  "In Progress": { color: "text-primary", bg: "bg-primary/10 border-primary/20" },
  "Awaiting Supervisor": { color: "text-sky-700", bg: "bg-sky-50 border-sky-200" },
  "Awaiting Admin": { color: "text-indigo-700", bg: "bg-indigo-50 border-indigo-200" },
  "Awaiting Super Admin": { color: "text-violet-700", bg: "bg-violet-50 border-violet-200" },
  "Done": { color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
  "On Hold": { color: "text-orange-700", bg: "bg-orange-50 border-orange-200" },
  "Overdue": { color: "text-red-700", bg: "bg-red-50 border-red-200" },
  "Rework": { color: "text-purple-700", bg: "bg-purple-50 border-purple-200" },
};

const PRIORITY_CONFIG: Record<UiPriority, { color: string; dot: string }> = {
  Low: { color: "text-gray-600", dot: "bg-gray-400" },
  Medium: { color: "text-amber-600", dot: "bg-amber-500" },
  High: { color: "text-red-600", dot: "bg-red-500" },
};

const JOB_TITLE_OPTIONS = [
  "Structural Inspection",
  "Engineering",
  "Architectural Plan",
  "Earth Work",
  "Retaining Wall",
  "Plumbing/Drainage",
  "Hydraulic Plan/Strome Water",
  "Robot Structure",
] as const;

const WIND_OPTIONS = ["N2", "N3", "N4", "N5", "C1", "C2"] as const;
type WindOption = (typeof WIND_OPTIONS)[number];

interface FormState {
  jobNumber: string;
  title: string;
  client: string;
  address: string;
  description: string;
  supervisorId: string;
  assigneeId: string;
  priority: UiPriority;
  estimatedTime: string;
  startDate: string;
  eta: string;
  wind: "" | WindOption;
  incomingDate: string;
  due: string;
  remarks: string;
  comments: string;
}

const EMPTY_FORM: FormState = {
  jobNumber: "",
  title: "",
  client: "",
  address: "",
  description: "",
  supervisorId: "",
  assigneeId: "",
  priority: "Medium",
  estimatedTime: "",
  startDate: "",
  eta: "",
  wind: "",
  incomingDate: "",
  due: "",
  remarks: "",
  comments: "",
};

type ExistingAttachment = ExistingJobAttachment;

type JobWithChecklist = ApiJob & {
  checklist?: ChecklistTemplateItem[];
  descriptionText?: string | null;
  estimatedTime?: string | null;
  startDate?: string | null;
  eta?: string | null;
  wind?: string | null;
  incomingDate?: string | null;
  remarks?: string | null;
  comments?: string | null;
};

function toDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  return String(iso).slice(0, 10);
}

function applyJobToForm(
  job: JobWithChecklist,
  extras: string[],
  role: Role,
  currentUserId?: string,
) {
  const meta = parseJobMeta(job.description ?? null);
  const checklist =
    Array.isArray(job.checklist) && job.checklist.length > 0
      ? job.checklist
      : meta.checklist;
  const descriptionText =
    typeof job.descriptionText === "string" ? job.descriptionText : meta.descriptionText;
  const assigneeId = job.assignee?.role === "user" ? job.assignee.id : "";
  const memberIdsFromApi =
    extras.length > 0
      ? extras
      : (job.assignees ?? [])
          .filter((a) => a.role === "user" && a.id !== assigneeId)
          .map((a) => a.id);
  const windValue: "" | WindOption = WIND_OPTIONS.includes(job.wind as WindOption)
    ? (job.wind as WindOption)
    : "";
  return {
    form: {
      jobNumber: job.number.replace(/^JOB-/i, ""),
      title: job.title,
      client: job.client,
      address: job.address ?? "",
      description: descriptionText,
      supervisorId:
        job.supervisor?.id ??
        (role === "supervisor" ? (currentUserId ?? "") : ""),
      assigneeId,
      priority: priorityToUi(job.priority),
      estimatedTime: job.estimatedTime ?? "",
      startDate: toDateInput(job.startDate),
      eta: toDateInput(job.eta),
      wind: windValue,
      incomingDate: toDateInput(job.incomingDate),
      due: toDateInput(job.dueDate),
      remarks: job.remarks ?? "",
      comments: job.comments ?? "",
    },
    checklist,
    memberIds: memberIdsFromApi,
  };
}

export default function JobManagement(
  { role = "super-admin" as Role, initialTab }: { role?: Role; initialTab?: "assignments" | "rework" } = {},
) {
  const { user: currentUser } = useAuth();
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

  const invalidateJobs = async (jobId?: string | null) => {
    await qc.invalidateQueries({ queryKey: getListJobsQueryKey() });
    if (jobId) {
      await qc.invalidateQueries({ queryKey: getGetJobQueryKey(jobId) });
    }
  };

  const [liveReviewSessions, setLiveReviewSessions] = useState<ReviewCheckSession[]>([]);

  const jobs: UiJob[] = useMemo(
    () => (jobsQuery.data ?? []).map(mapJob),
    [jobsQuery.data],
  );
  const liveReviewByJobId = useMemo(() => {
    const map = new Map<string, ReviewCheckSession>();
    for (const session of liveReviewSessions) {
      if (!session.segmentStartedAt || !session.isLive) continue;
      map.set(session.jobId, session);
    }
    return map;
  }, [liveReviewSessions]);

  useEffect(() => {
    if (role === "user") {
      setLiveReviewSessions([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const rows = await fetchActiveReviewCheckSessions();
        if (!cancelled) setLiveReviewSessions(rows);
      } catch {
        if (!cancelled) setLiveReviewSessions([]);
      }
    };
    void load();
    const id = window.setInterval(load, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [role]);
  const assignables = assignablesQuery.data ?? [];
  const supervisors = useMemo(
    () => assignables.filter((u) => u.role === "supervisor"),
    [assignables],
  );
  const workers = useMemo(
    () => assignables.filter((u) => u.role === "user"),
    [assignables],
  );

  const { search, setSearch, headerSearch } = useDashboardSearch(
    "Search jobs by title, client, number, address…",
  );
  const [filter, setFilter] = useState<"All" | UiStatus>(initialTab === "rework" ? "Rework" : "All");
  const [assignmentFilter, setAssignmentFilter] = useState<"all" | "unassigned">(initialTab === "assignments" ? "unassigned" : "all");
  const [sortMode, setSortMode] = useState<JobListSortMode>(() => readStoredJobListSort());
  const [openId, setOpenId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [reassignFor, setReassignFor] = useState<UiJob | null>(null);
  const [reassignTo, setReassignTo] = useState<string>("");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [assigneeMenuOpen, setAssigneeMenuOpen] = useState(false);
  const [jobFiles, setJobFiles] = useState<File[]>([]);
  const [existingAttachments, setExistingAttachments] = useState<ExistingAttachment[]>([]);
  const [editLoading, setEditLoading] = useState(false);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [checklistTemplate, setChecklistTemplate] = useState<ChecklistTemplateItem[]>([]);
  const [checklistItemFiles, setChecklistItemFiles] = useState<Record<number, File[]>>({});
  const [checkPendingFile, setCheckPendingFile] = useState<File | null>(null);
  const [savedTemplates, setSavedTemplates] = useState<Array<{ id: string; name: string; items: ChecklistTemplateItem[] }>>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [uploadFileProgress, setUploadFileProgress] = useState<{ completed: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [jobNumberLoading, setJobNumberLoading] = useState(false);
  const assigneeMenuRef = useRef<HTMLDivElement>(null);

  const selectedWorkerIds = useMemo(
    () => Array.from(new Set([form.assigneeId, ...memberIds].filter((id): id is string => Boolean(id)))),
    [form.assigneeId, memberIds],
  );
  const selectedWorkerNames = useMemo(
    () => workers.filter((u) => selectedWorkerIds.includes(u.id)).map((u) => u.name),
    [workers, selectedWorkerIds],
  );

  const applyWorkerSelection = (ids: string[], preferredPrimaryId?: string) => {
    const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
    const nextPrimaryId =
      preferredPrimaryId && uniqueIds.includes(preferredPrimaryId)
        ? preferredPrimaryId
        : uniqueIds[0] ?? "";
    setForm((prev) => ({ ...prev, assigneeId: nextPrimaryId }));
    setMemberIds(uniqueIds.filter((id) => id !== nextPrimaryId));
  };

  const toggleWorkerSelection = (workerId: string) => {
    const currentlySelected = selectedWorkerIds.includes(workerId);
    if (currentlySelected) {
      const remaining = selectedWorkerIds.filter((id) => id !== workerId);
      const nextPrimaryId = workerId === form.assigneeId ? remaining[0] : form.assigneeId;
      applyWorkerSelection(remaining, nextPrimaryId);
      return;
    }
    applyWorkerSelection([...selectedWorkerIds, workerId], form.assigneeId || workerId);
  };

  useEffect(() => {
    if (!assigneeMenuOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!assigneeMenuRef.current?.contains(event.target as Node)) {
        setAssigneeMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [assigneeMenuOpen]);

  const startEdit = async (j: UiJob) => {
    setEditingId(j.id);
    setJobFiles([]);
    setExistingAttachments([]);
    setCheckPendingFile(null);
    setUploadingFiles(false);
    setUploadFileProgress(null);
    setError(null);
    setAssigneeMenuOpen(false);
    setOpenId(null);
    setModalOpen(true);
    setEditLoading(true);

    try {
      await assignablesQuery.refetch();

      let job: JobWithChecklist | undefined;
      try {
        const res = await fetch(`/api/jobs/${j.id}`, { credentials: "include" });
        if (res.ok) job = (await res.json()) as JobWithChecklist;
      } catch {
        // fall back to list cache below
      }
      if (!job) {
        job = (jobsQuery.data ?? []).find((x) => x.id === j.id) as JobWithChecklist | undefined;
      }
      if (!job) {
        setError("Failed to load job details");
        return;
      }

      let extras: string[] = [];
      try {
        const membersRes = await fetch(`/api/jobs/${j.id}/members`, { credentials: "include" });
        if (membersRes.ok) {
          const data = (await membersRes.json()) as unknown;
          if (Array.isArray(data)) {
            const assigneeId = job.assignee?.id ?? j.assigneeId ?? "";
            extras = data
              .filter(
                (p) =>
                  p &&
                  typeof p === "object" &&
                  typeof (p as { id?: string }).id === "string" &&
                  (p as { role?: string }).role === "user" &&
                  (p as { id: string }).id !== assigneeId,
              )
              .map((p) => (p as { id: string }).id);
          }
        }
      } catch {
        // members are optional for the form
      }

      let attachments: ExistingAttachment[] = [];
      try {
        const attRes = await fetch(`/api/jobs/${j.id}/attachments`, { credentials: "include" });
        if (attRes.ok) {
          const attData = (await attRes.json()) as unknown;
          if (Array.isArray(attData)) {
            for (const a of attData) {
              if (!a || typeof a !== "object") continue;
              const parsed = parseExistingJobAttachment(a as Record<string, unknown>);
              if (parsed) attachments.push(parsed);
            }
          }
        }
      } catch {
        // attachments are optional for the form
      }

      const applied = applyJobToForm(job, extras, role, currentUser?.id);
      setForm(applied.form);
      setChecklistTemplate(applied.checklist);
      setMemberIds(applied.memberIds);
      setExistingAttachments(attachments);
    } finally {
      setEditLoading(false);
    }
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
  const addDroppedFiles = (fileList: FileList | File[]) => {
    const all = Array.from(fileList).filter((f) => f && typeof f.name === "string");
    const picked = filterJobFiles(all);
    if (picked.length === 0) {
      setError(JOB_FILE_REJECTED_MESSAGE);
      return;
    }
    const skipped = all.length - picked.length;
    if (skipped > 0) {
      window.alert(
        `${skipped} file(s) were skipped (unsupported type). ${JOB_FILE_REJECTED_MESSAGE}`,
      );
    }
    setError(null);
    setJobFiles((prev) => [...prev, ...picked]);
  };
  const removeJobFile = (idx: number) => {
    setJobFiles(jobFiles.filter((_, i) => i !== idx));
  };
  const deleteExistingAttachment = async (attachment: ExistingAttachment) => {
    if (!editingId) return;
    if (attachment.uploadedById && attachment.uploadedById !== currentUser?.id) {
      window.alert("You can only delete files you uploaded.");
      return;
    }
    if (!window.confirm(`Delete "${attachment.fileName}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/jobs/${editingId}/attachments/${attachment.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(data.message || "Failed to delete file");
      }
      setExistingAttachments((prev) => prev.filter((a) => a.id !== attachment.id));
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Failed to delete file");
    }
  };
  const addChecklistFromFile = (file: File) => {
    if (!isChecklistDocFile(file)) {
      setError("Checklist files must be Word (.doc, .docx) or PDF only.");
      return;
    }
    const text = file.name.trim();
    if (!text) return;
    setChecklistTemplate((prev) => {
      const nextIndex = prev.length;
      setChecklistItemFiles((filesPrev) => ({ ...filesPrev, [nextIndex]: [file] }));
      return [
        ...prev,
        { text, attachmentRequired: true },
      ];
    });
    setCheckPendingFile(null);
    setError(null);
  };
  const removeChecklistItem = (idx: number) => {
    setChecklistTemplate(checklistTemplate.filter((_, i) => i !== idx));
    setChecklistItemFiles((prev) => {
      const next: Record<number, File[]> = {};
      for (const [key, files] of Object.entries(prev)) {
        const i = Number(key);
        if (i === idx) continue;
        next[i > idx ? i - 1 : i] = files;
      }
      return next;
    });
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/checklist-templates", { credentials: "include" });
        if (!res.ok) return;
        const data = (await res.json()) as Array<{ id: string; name: string; items: ChecklistTemplateItem[] }>;
        if (!cancelled && Array.isArray(data)) setSavedTemplates(data);
      } catch {
      }
    })();
    return () => { cancelled = true; };
  }, [modalOpen]);

  const applySavedTemplate = () => {
    const selected = savedTemplates.find((t) => t.id === selectedTemplateId);
    if (!selected) return;
    setChecklistTemplate(Array.isArray(selected.items) ? selected.items : []);
    setChecklistItemFiles({});
  };

  const saveCurrentAsTemplate = async () => {
    const name = templateName.trim();
    if (!name || checklistTemplate.length === 0) return;
    setSavingTemplate(true);
    try {
      const res = await fetch("/api/checklist-templates", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, items: checklistTemplate }),
      });
      if (!res.ok) return;
      const created = (await res.json()) as { id: string; name: string; items: ChecklistTemplateItem[] };
      setSavedTemplates((prev) => [created, ...prev]);
      setSelectedTemplateId(created.id);
      setTemplateName("");
    } finally {
      setSavingTemplate(false);
    }
  };

  const searchQuery = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    const matches = jobs.filter((j) =>
      (filter === "All" || j.status === filter) &&
      (assignmentFilter === "all" || j.assigneeId === null) &&
      (!searchQuery ||
        j.title.toLowerCase().includes(searchQuery) ||
        j.client.toLowerCase().includes(searchQuery) ||
        j.number.toLowerCase().includes(searchQuery) ||
        j.number.replace(/^JOB-/i, "").toLowerCase().includes(searchQuery) ||
        (j.address?.toLowerCase().includes(searchQuery) ?? false) ||
        j.assignee.toLowerCase().includes(searchQuery) ||
        j.assignees.some((a) => a.name.toLowerCase().includes(searchQuery)) ||
        (j.supervisor?.toLowerCase().includes(searchQuery) ?? false)),
    );
    return sortJobs(matches, sortMode, (j) => ({
      number: j.number,
      status: j.status,
      createdAt: j.createdAt,
      updatedAt: j.updatedAt,
      reviewStartedAt: j.reviewStartedAt,
    }));
  }, [jobs, filter, assignmentFilter, searchQuery, sortMode]);
  const { page, setPage, totalPages, pageItems, total, pageSize } = usePagination(filtered, 100);

  useEffect(() => {
    setPage(1);
  }, [sortMode, setPage]);

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
      const action =
        role === "supervisor"
          ? "supervisor_approve"
          : "admin_complete";
      const res = await fetch(`/api/jobs/${j.id}/review`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as any).error || "Failed to update job status");
      }
      await invalidateJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mark job completed");
    }
  };

  const putOnHold = async (j: UiJob) => {
    setOpenId(null);
    try {
      await updateMutation.mutateAsync({
        id: j.id,
        data: { status: "on_hold" as ApiJob["status"] },
      });
      await invalidateJobs(j.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to put job on hold");
    }
  };

  const resumeFromHold = async (j: UiJob) => {
    setOpenId(null);
    try {
      const res = await fetch(`/api/jobs/${j.id}/review`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resume_from_hold" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as any).error || "Failed to resume job");
      }
      await invalidateJobs(j.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resume job");
    }
  };

  const submit = async () => {
    if (!form.title || !form.client) {
      setError("Title and client are required");
      return;
    }
    const effectiveSupervisorId =
      role === "supervisor" ? (currentUser?.id ?? "") : form.supervisorId;

    const workerIds = new Set(workers.map((w) => w.id));
    const selectedValidWorkerIds = selectedWorkerIds.filter((id) => workerIds.has(id));
    const hasAssignees = selectedValidWorkerIds.length > 0;

    if ((role === "super-admin" || role === "admin") && !effectiveSupervisorId && !hasAssignees) {
      setError("Select a supervisor or at least one assignee (worker)");
      return;
    }

    // Flush a selected-but-not-added checklist file into the template before save
    let finalChecklist = checklistTemplate;
    let finalChecklistFiles = checklistItemFiles;
    if (checkPendingFile) {
      const nextIndex = checklistTemplate.length;
      finalChecklist = [
        ...checklistTemplate,
        { text: checkPendingFile.name.trim(), attachmentRequired: true },
      ];
      finalChecklistFiles = { ...checklistItemFiles, [nextIndex]: [checkPendingFile] };
    }
    finalChecklist = finalChecklist.map((item) => ({ ...item, attachmentRequired: true }));
    if (finalChecklist.length === 0) {
      setError("Add at least one checklist file — the file name becomes the task name.");
      return;
    }

    const primaryAssigneeId =
      form.assigneeId && workerIds.has(form.assigneeId)
        ? form.assigneeId
        : selectedValidWorkerIds[0] ?? "";

    setError(null);
    const descriptionPayload = serializeJobMeta(form.description, finalChecklist);
    const payload = {
      jobNumber: form.jobNumber.trim() || null,
      title: form.title,
      client: form.client,
      address: form.address || undefined,
      description: descriptionPayload,
      priority: PRIORITY_UI_TO_API[form.priority],
      supervisorId: effectiveSupervisorId || null,
      assigneeId: primaryAssigneeId || null,
      dueDate: form.due ? new Date(form.due).toISOString() : null,
      estimatedTime: form.estimatedTime.trim() || null,
      startDate: form.startDate ? new Date(form.startDate).toISOString() : null,
      eta: form.eta ? new Date(form.eta).toISOString() : null,
      wind: form.wind || null,
      incomingDate: form.incomingDate ? new Date(form.incomingDate).toISOString() : null,
      // Remarks/comments are for after the job exists (edit / Job Detail), not create.
      remarks: editingId !== null ? (form.remarks.trim() || null) : null,
      comments: editingId !== null ? (form.comments.trim() || null) : null,
    };

    const syncMembers = async (jobId: string) => {
      const assigneeId = payload.assigneeId;
      const desired = Array.from(
        new Set(selectedValidWorkerIds.filter((id) => id && id !== assigneeId)),
      );
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

    const uploadAllFiles = async (jobId: string, checklistFiles: Record<number, File[]>) => {
      const specs = buildJobSaveUploadSpecs(jobFiles, checklistFiles);
      if (specs.length === 0) return;

      setUploadingFiles(true);
      setUploadFileProgress({ completed: 0, total: specs.length });
      try {
        await uploadJobAttachmentsBatch(jobId, specs, {
          suppressNotifications: true,
          onProgress: (completed, total) => setUploadFileProgress({ completed, total }),
        });
      } finally {
        setUploadingFiles(false);
        setUploadFileProgress(null);
      }
    };

    try {
      if (editingId !== null) {
        await updateMutation.mutateAsync({ id: editingId, data: payload });
        await uploadAllFiles(editingId, finalChecklistFiles);
        await syncMembers(editingId);
        await invalidateJobs(editingId);
      } else {
        const created = await createMutation.mutateAsync({ data: payload });
        await uploadAllFiles(created.id, finalChecklistFiles);
        await syncMembers(created.id);
        await invalidateJobs(created.id);
      }
      setForm(EMPTY_FORM);
      setJobFiles([]);
      setExistingAttachments([]);
      setMemberIds([]);
      setChecklistTemplate([]);
      setChecklistItemFiles({});
      setCheckPendingFile(null);
      setUploadingFiles(false);
      setUploadFileProgress(null);
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
    setChecklistItemFiles({});
    setCheckPendingFile(null);
    setJobFiles([]);
    setExistingAttachments([]);
    setMemberIds([]);
    setEditLoading(false);
    setUploadingFiles(false);
    setUploadFileProgress(null);
    setJobNumberLoading(false);
    setError(null);
  };

  const openCreateJobModal = async () => {
    setEditingId(null);
    setChecklistTemplate([]);
    setCheckPendingFile(null);
    setJobFiles([]);
    setExistingAttachments([]);
    setMemberIds([]);
    setUploadingFiles(false);
    setUploadFileProgress(null);
    setError(null);
    setAssigneeMenuOpen(false);
    setModalOpen(true);
    setJobNumberLoading(true);

    const { data: freshAssignables } = await assignablesQuery.refetch();
    const freshSupervisors = (freshAssignables ?? []).filter((u) => u.role === "supervisor");

    setForm({
      ...EMPTY_FORM,
      incomingDate: todayJobDateInput(),
      supervisorId:
        role === "supervisor"
          ? (currentUser?.id ?? "")
          : (freshSupervisors[0]?.id ?? ""),
    });

    try {
      const res = await fetch("/api/jobs/next-number", { credentials: "include" });
      if (res.ok) {
        const data = (await res.json()) as { jobNumber?: string };
        if (data.jobNumber) {
          setForm((prev) => ({ ...prev, jobNumber: data.jobNumber! }));
        }
      }
    } catch {
      // Server assigns on create if preview fails.
    } finally {
      setJobNumberLoading(false);
    }
  };

  const counts = {
    All: jobs.length,
    "Not Started": jobs.filter((j) => j.status === "Not Started").length,
    "In Progress": jobs.filter((j) => j.status === "In Progress").length,
    "Awaiting Supervisor": jobs.filter((j) => j.status === "Awaiting Supervisor").length,
    "Awaiting Admin": jobs.filter((j) => j.status === "Awaiting Admin").length,
    "Awaiting Super Admin": jobs.filter((j) => j.status === "Awaiting Super Admin").length,
    "Done": jobs.filter((j) => j.status === "Done").length,
    "On Hold": jobs.filter((j) => j.status === "On Hold").length,
    "Overdue": jobs.filter((j) => j.status === "Overdue").length,
    "Rework": jobs.filter((j) => j.status === "Rework").length,
  };

  const isSaving = createMutation.isPending || updateMutation.isPending || uploadingFiles;
  const saveButtonLabel =
    uploadingFiles && uploadFileProgress && uploadFileProgress.total > 0
      ? `Uploading ${uploadFileProgress.completed}/${uploadFileProgress.total}…`
      : isSaving
        ? "Saving…"
        : editingId !== null
          ? "Save changes"
          : "Create Job";

  return (
    <DashboardLayout
      title="Job Management"
      role={role}
      headerSearch={headerSearch}
    >
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
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-9 gap-2 md:gap-3 mb-6">
        {(["All", "Not Started", "In Progress", "On Hold", "Awaiting Supervisor", "Awaiting Admin", "Awaiting Super Admin", "Done", "Overdue", "Rework"] as const).map((s, i) => (
          <motion.button
            key={s}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            whileHover={{ y: -3, boxShadow: "0 12px 24px rgba(0,0,0,0.06)" }}
            onClick={() => setFilter(s)}
            className={`p-3 md:p-4 rounded-xl border-2 text-left transition-colors ${filter === s ? "border-primary bg-primary/5" : "border-gray-100 bg-white hover:border-gray-200"}`}
          >
            <div className={`text-[10px] md:text-xs font-medium ${filter === s ? "text-primary" : "text-gray-500"}`}>{s}</div>
            <div className="text-xl md:text-2xl font-bold text-gray-900 mt-1">{counts[s]}</div>
          </motion.button>
        ))}
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          <div className="flex flex-col sm:flex-row gap-3 flex-1">
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 flex-1 max-w-md focus-within:border-primary transition-colors">
              <Search size={16} className="text-gray-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by title, client, job number, address, assignee, or supervisor…" className="bg-transparent !text-gray-900 !placeholder:text-gray-400 text-sm flex-1 focus:outline-none" />
            </div>
            <JobListSortControl value={sortMode} onChange={setSortMode} variant="toolbar" />
          </div>
          {role !== "user" && (
            <motion.button
              whileHover={{ scale: 1.04, y: -1 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => void openCreateJobModal()}
              className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white px-5 py-2.5 rounded-xl font-medium text-sm shadow-lg shadow-primary/30 transition-colors"
            >
              <Plus size={16} /> Create Job
            </motion.button>
          )}
        </div>

        {error && (
          <div className="px-5 py-3 bg-red-50 border-b border-red-100 text-sm text-red-700">{error}</div>
        )}

        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {["Job", "Assignees", "Supervisor", "Priority", "Status", "Progress", "Timeline", ""].map((h) => (
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
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ delay: i * 0.03 }}
                      className="group border-b border-gray-50 last:border-0 bg-white hover:bg-gray-50 transition-colors duration-150"
                    >
                      <td className="px-6 py-4 cursor-pointer" onClick={() => setLocation(`${basePath}/${j.id}`)}>
                        <div className="font-medium text-gray-900 text-sm flex items-center gap-1.5 transition-colors group-hover:text-primary">{j.title} <ExternalLink size={11} className="text-gray-300 group-hover:text-primary/60" /></div>
                        {j.address ? (
                          <div className="text-xs text-gray-600 mt-0.5 truncate max-w-md" title={j.address}>{j.address}</div>
                        ) : null}
                        <div className="text-xs text-gray-500 mt-0.5">{j.number} · {j.client} · <span className="text-gray-400">Created {j.created}</span></div>
                      </td>
                      <td className="px-6 py-4">
                        {j.assignees.length === 0 ? (
                          <span className="text-sm text-gray-400">Unassigned</span>
                        ) : (
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                            {j.assignees.map((a) => (
                              <div key={a.id} className="flex items-center gap-1.5">
                                <div
                                  title={a.name}
                                  className="w-6 h-6 rounded-full bg-gradient-to-br from-primary to-sky-700 text-white text-[9px] font-bold flex items-center justify-center shrink-0"
                                >
                                  {initialsForName(a.name)}
                                </div>
                                <span className="text-sm text-gray-700">{a.name}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {j.supervisor ? (
                          <div className="flex items-center gap-1.5">
                            <div
                              title={j.supervisor}
                              className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-500 to-purple-700 text-white text-[9px] font-bold flex items-center justify-center shrink-0"
                            >
                              {initialsForName(j.supervisor)}
                            </div>
                            <span className="text-sm text-gray-700">{j.supervisor}</span>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5">
                          <div className={`w-1.5 h-1.5 rounded-full ${pCfg.dot}`} />
                          <span className={`text-xs font-medium ${pCfg.color}`}>{j.priority}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col items-start gap-0.5">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-lg border text-xs font-semibold ${sCfg.bg} ${sCfg.color}`}>
                            {j.status}
                          </span>
                          {j.status === "Awaiting Supervisor" && role !== "user" && (() => {
                            const session = liveReviewByJobId.get(j.id);
                            if (!session?.segmentStartedAt || !session.isLive) return null;
                            return (
                              <ReviewTimerBadge
                                accumulatedSeconds={session.accumulatedSeconds}
                                segmentStartedAt={session.segmentStartedAt}
                              />
                            );
                          })()}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 w-32">
                          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${j.progress}%` }}
                              transition={{ duration: 0.8, delay: i * 0.05, ease: "easeOut" }}
                              className={`h-full rounded-full ${j.status === "Done" ? "bg-emerald-500" : j.status === "Overdue" ? "bg-red-500" : j.status === "On Hold" ? "bg-orange-400" : "bg-primary"}`}
                            />
                          </div>
                          <span className="text-xs font-semibold text-gray-600 w-8 text-right">{j.progress}%</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {j.status === "Done" && j.completed ? (
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
                            <DropdownMenuItem
                              className="cursor-pointer"
                              onClick={() => setLocation(`${basePath}/${j.id}`)}
                            >
                              <ExternalLink size={14} className="mr-2 text-gray-400" />
                              Open job
                            </DropdownMenuItem>
                            {role !== "user" && (
                              <>
                                {(j.status !== "Done" || role === "admin" || role === "super-admin") && (
                                  <DropdownMenuItem className="cursor-pointer" onClick={() => startReassign(j)}>
                                    <UserPlus size={14} className="mr-2 text-gray-400" />
                                    Reassign
                                  </DropdownMenuItem>
                                )}
                                {role === "admin" && j.status === "Awaiting Admin" && (
                                  <DropdownMenuItem className="cursor-pointer" onClick={() => markCompleted(j)}>
                                    <CheckCircle2 size={14} className="mr-2 text-emerald-500" />
                                    Send to Super Admin
                                  </DropdownMenuItem>
                                )}
                                {role === "super-admin" && j.status === "Awaiting Super Admin" && (
                                  <DropdownMenuItem className="cursor-pointer" onClick={() => markCompleted(j)}>
                                    <CheckCircle2 size={14} className="mr-2 text-emerald-500" />
                                    Complete Job
                                  </DropdownMenuItem>
                                )}
                                {(role === "supervisor" || role === "admin" || role === "super-admin") &&
                                  j.status === "On Hold" && (
                                  <DropdownMenuItem className="cursor-pointer" onClick={() => resumeFromHold(j)}>
                                    <Play size={14} className="mr-2 text-emerald-500" />
                                    Resume Job
                                  </DropdownMenuItem>
                                )}
                                {(role === "supervisor" || role === "admin" || role === "super-admin") &&
                                  j.status !== "Done" &&
                                  j.status !== "On Hold" && (
                                  <DropdownMenuItem className="cursor-pointer" onClick={() => putOnHold(j)}>
                                    <Pause size={14} className="mr-2 text-orange-500" />
                                    Put on Hold
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

        {/* Mobile card list — desktop table unchanged above */}
        <div className="md:hidden divide-y divide-gray-100">
          {jobsQuery.isLoading && <div className="text-center py-12 text-sm text-gray-400">Loading jobs…</div>}
          {!jobsQuery.isLoading && filtered.length === 0 && (
            <div className="text-center py-12 text-sm text-gray-400">No jobs found.</div>
          )}
          <AnimatePresence>
            {!jobsQuery.isLoading &&
              pageItems.map((j, i) => {
                const sCfg = STATUS_CONFIG[j.status];
                const pCfg = PRIORITY_CONFIG[j.priority];
                return (
                  <motion.div
                    key={j.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -12 }}
                    transition={{ delay: i * 0.03 }}
                    className="p-4 bg-white"
                  >
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        onClick={() => setLocation(`${basePath}/${j.id}`)}
                        className="flex-1 min-w-0 text-left"
                      >
                        <div className="font-semibold text-gray-900 text-sm">{j.title}</div>
                        {j.address ? (
                          <div className="text-xs text-gray-600 mt-0.5 line-clamp-2">{j.address}</div>
                        ) : null}
                        <div className="text-xs text-gray-500 mt-1">
                          {j.number} · {j.client} · Created {j.created}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 mt-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-lg border text-[10px] font-semibold ${sCfg.bg} ${sCfg.color}`}>
                            {j.status}
                          </span>
                          <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${pCfg.color}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${pCfg.dot}`} />
                            {j.priority}
                          </span>
                          {j.status === "Awaiting Supervisor" && role !== "user" && (() => {
                            const session = liveReviewByJobId.get(j.id);
                            if (!session?.segmentStartedAt || !session.isLive) return null;
                            return (
                              <ReviewTimerBadge
                                accumulatedSeconds={session.accumulatedSeconds}
                                segmentStartedAt={session.segmentStartedAt}
                              />
                            );
                          })()}
                        </div>
                        <div className="mt-3 space-y-1.5 text-xs text-gray-600">
                          <div>
                            <span className="font-semibold text-gray-500">Assignees: </span>
                            {j.assignees.length === 0 ? "Unassigned" : j.assignees.map((a) => a.name).join(", ")}
                          </div>
                          <div>
                            <span className="font-semibold text-gray-500">Supervisor: </span>
                            {j.supervisor ?? "—"}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-gray-500 shrink-0">Progress:</span>
                            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden max-w-[120px]">
                              <div
                                className={`h-full rounded-full ${j.status === "Done" ? "bg-emerald-500" : j.status === "Overdue" ? "bg-red-500" : j.status === "On Hold" ? "bg-orange-400" : "bg-primary"}`}
                                style={{ width: `${j.progress}%` }}
                              />
                            </div>
                            <span className="font-semibold">{j.progress}%</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Calendar size={12} className={j.status === "Overdue" ? "text-red-500" : "text-gray-400"} />
                            {j.status === "Done" && j.completed ? (
                              <span className="text-emerald-700 font-semibold">Done {j.completed}</span>
                            ) : (
                              <span className={j.status === "Overdue" ? "text-red-600 font-semibold" : ""}>
                                {j.status === "Overdue" ? "Was due " : "Due "}{j.due}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                      <div className="flex flex-col items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => setLocation(`${basePath}/${j.id}`)}
                          className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-primary"
                          aria-label="Open job"
                        >
                          <ChevronRight size={18} />
                        </button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                              aria-label="Job actions"
                            >
                              <MoreVertical size={16} />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem className="cursor-pointer" onClick={() => setLocation(`${basePath}/${j.id}`)}>
                              <ExternalLink size={14} className="mr-2 text-gray-400" />
                              Open job
                            </DropdownMenuItem>
                            {role !== "user" && (
                              <>
                                {(j.status !== "Done" || role === "admin" || role === "super-admin") && (
                                  <DropdownMenuItem className="cursor-pointer" onClick={() => startReassign(j)}>
                                    <UserPlus size={14} className="mr-2 text-gray-400" />
                                    Reassign
                                  </DropdownMenuItem>
                                )}
                                {role === "admin" && j.status === "Awaiting Admin" && (
                                  <DropdownMenuItem className="cursor-pointer" onClick={() => markCompleted(j)}>
                                    <CheckCircle2 size={14} className="mr-2 text-emerald-500" />
                                    Send to Super Admin
                                  </DropdownMenuItem>
                                )}
                                {role === "super-admin" && j.status === "Awaiting Super Admin" && (
                                  <DropdownMenuItem className="cursor-pointer" onClick={() => markCompleted(j)}>
                                    <CheckCircle2 size={14} className="mr-2 text-emerald-500" />
                                    Complete Job
                                  </DropdownMenuItem>
                                )}
                                {(role === "supervisor" || role === "admin" || role === "super-admin") &&
                                  j.status === "On Hold" && (
                                  <DropdownMenuItem className="cursor-pointer" onClick={() => resumeFromHold(j)}>
                                    <Play size={14} className="mr-2 text-emerald-500" />
                                    Resume Job
                                  </DropdownMenuItem>
                                )}
                                {(role === "supervisor" || role === "admin" || role === "super-admin") &&
                                  j.status !== "Done" &&
                                  j.status !== "On Hold" && (
                                  <DropdownMenuItem className="cursor-pointer" onClick={() => putOnHold(j)}>
                                    <Pause size={14} className="mr-2 text-orange-500" />
                                    Put on Hold
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
                      </div>
                    </div>
                  </motion.div>
                );
              })}
          </AnimatePresence>
        </div>
        <Pagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} onChange={setPage} label="jobs" />
      </motion.div>

      {/* Create / Edit Job Modal */}
      <AnimatePresence>
        {modalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={closeModal} className="absolute inset-0 bg-black/50" />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} transition={{ type: "spring", stiffness: 300, damping: 28 }} className="relative w-full max-w-[96vw] xl:max-w-7xl max-h-[92vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-primary/5 to-sky-50 shrink-0">
                <div>
                  <h3 className="font-bold text-gray-900 text-base">{editingId !== null ? "Edit Job" : "Create New Job"}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{editingId !== null ? "Update job details" : "Assign a new job"}</p>
                </div>
                <button onClick={closeModal} className="p-1.5 rounded-lg hover:bg-gray-100"><X size={16} /></button>
              </div>
              {error && (
                <div className="px-6 py-3 bg-red-50 border-b border-red-100 text-sm text-red-700 shrink-0">{error}</div>
              )}
              {editLoading ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 py-16 text-gray-500">
                  <Loader2 size={28} className="animate-spin text-primary" />
                  <p className="text-sm">Loading job details…</p>
                </div>
              ) : (
              <div className="px-6 py-4 grid md:grid-cols-2 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)] gap-x-6 gap-y-4 overflow-y-auto flex-1 min-h-0 items-stretch">
                {/* LEFT COLUMN — Job details */}
                <div className="space-y-3 min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Job Details</div>
                  <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)] gap-3">
                    <div className="min-w-0">
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">Job Number</label>
                      <input
                        value={form.jobNumber}
                        onChange={(e) => setForm({ ...form, jobNumber: e.target.value })}
                        placeholder={jobNumberLoading ? "Loading next number…" : "e.g. 154764"}
                        className="w-full min-w-0 px-3 py-2.5 bg-gray-50 border-2 border-gray-200 rounded-xl text-sm !text-gray-900 !placeholder:text-gray-400 focus:outline-none focus:border-primary focus:bg-white transition-colors"
                      />
                    </div>
                    <div className="min-w-0">
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">Job Title</label>
                      <input
                        list="job-title-options"
                        value={form.title}
                        onChange={(e) => setForm({ ...form, title: e.target.value })}
                        placeholder="Select or type a custom job title"
                        className="w-full min-w-0 px-3 py-2.5 bg-gray-50 border-2 border-gray-200 rounded-xl text-sm !text-gray-900 !placeholder:text-gray-400 focus:outline-none focus:border-primary focus:bg-white transition-colors"
                      />
                      <datalist id="job-title-options">
                        {JOB_TITLE_OPTIONS.map((option) => (
                          <option key={option} value={option} />
                        ))}
                      </datalist>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="min-w-0">
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">Client</label>
                      <input value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} placeholder="e.g. Anderson Residence" className="w-full min-w-0 px-3 py-2.5 bg-gray-50 border-2 border-gray-200 rounded-xl text-sm !text-gray-900 !placeholder:text-gray-400 focus:outline-none focus:border-primary focus:bg-white transition-colors" />
                    </div>
                    <div className="min-w-0">
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">Supervisor</label>
                      {role === "supervisor" ? (
                        <input
                          value={currentUser?.name ?? "Current Supervisor"}
                          readOnly
                          className="w-full min-w-0 px-3 py-2.5 bg-gray-100 border-2 border-gray-200 rounded-xl text-sm !text-gray-900 cursor-not-allowed"
                        />
                      ) : (
                        <select
                          value={form.supervisorId}
                          onChange={(e) => setForm({ ...form, supervisorId: e.target.value })}
                          className="w-full min-w-0 px-3 py-2.5 bg-gray-50 border-2 border-gray-200 rounded-xl text-sm !text-gray-900 focus:outline-none focus:border-primary focus:bg-white transition-colors"
                        >
                          <option value="">No supervisor</option>
                          {supervisors.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                        </select>
                      )}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">Assignees</label>
                    <div ref={assigneeMenuRef} className="relative">
                      <button
                        type="button"
                        onClick={() => setAssigneeMenuOpen((prev) => !prev)}
                        className={`w-full min-h-[46px] px-3 py-2.5 bg-gray-50 border-2 border-gray-200 rounded-xl text-sm text-left focus:outline-none focus:border-primary focus:bg-white transition-colors ${selectedWorkerNames.length > 0 ? "!text-gray-900" : "text-gray-400"}`}
                      >
                        {selectedWorkerNames.length > 0 ? selectedWorkerNames.join(", ") : "Select Workers"}
                      </button>
                      {assigneeMenuOpen && (
                        <div className="absolute z-20 mt-2 w-full rounded-xl border-2 border-gray-200 bg-white shadow-lg">
                          <div className="max-h-52 overflow-y-auto p-2">
                            {workers.length === 0 ? (
                              <div className="px-2 py-4 text-xs text-gray-400 text-center">No workers available</div>
                            ) : (
                              <div className="space-y-1">
                                {workers.map((u) => {
                                  const checked = selectedWorkerIds.includes(u.id);
                                  return (
                                    <label key={u.id} className="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                                      <span className="flex items-center gap-2 min-w-0">
                                        <input
                                          type="checkbox"
                                          checked={checked}
                                          onChange={() => toggleWorkerSelection(u.id)}
                                          className="h-4 w-4"
                                        />
                                        <span className="text-sm text-gray-800 truncate">{u.name}</span>
                                      </span>
                                    </label>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                      Description
                      <span className="ml-1 font-normal text-gray-400">(text &amp; links)</span>
                    </label>
                    <DescriptionInput
                      key={`description-${editingId ?? "new"}`}
                      value={form.description}
                      onChange={(description) => setForm({ ...form, description })}
                      rows={4}
                    />
                  </div>
                  <div className="min-w-0">
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">Job Address</label>
                    <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="e.g. 120 Park Avenue, Sydney NSW 2000" className="w-full min-w-0 px-3 py-2.5 bg-gray-50 border-2 border-gray-200 rounded-xl text-sm !text-gray-900 !placeholder:text-gray-400 focus:outline-none focus:border-primary focus:bg-white transition-colors" />
                    <AddressUrlHint value={form.address} />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="min-w-0">
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">Est. Time</label>
                      <input
                        value={form.estimatedTime}
                        onChange={(e) => setForm({ ...form, estimatedTime: e.target.value })}
                        placeholder="e.g. 8 Hours"
                        className="w-full min-w-0 px-3 py-2.5 bg-gray-50 border-2 border-gray-200 rounded-xl text-sm !text-gray-900 !placeholder:text-gray-400 focus:outline-none focus:border-primary focus:bg-white transition-colors"
                      />
                    </div>
                    <div className="min-w-0">
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">Actual Time</label>
                      <input
                        value={editingId ? "From job timer" : "Tracked on Job Detail"}
                        readOnly
                        className="w-full min-w-0 px-3 py-2.5 bg-gray-100 border-2 border-gray-200 rounded-xl text-sm !text-gray-500 cursor-not-allowed"
                        title="Actual time comes from the job timer / time logs"
                      />
                    </div>
                    <div className="min-w-0">
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">Start Date</label>
                      <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className="w-full min-w-0 px-3 py-2.5 bg-gray-50 border-2 border-gray-200 rounded-xl text-sm !text-gray-900 focus:outline-none focus:border-primary focus:bg-white transition-colors" />
                    </div>
                    <div className="min-w-0">
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">ETA</label>
                      <input type="date" value={form.eta} onChange={(e) => setForm({ ...form, eta: e.target.value })} className="w-full min-w-0 px-3 py-2.5 bg-gray-50 border-2 border-gray-200 rounded-xl text-sm !text-gray-900 focus:outline-none focus:border-primary focus:bg-white transition-colors" />
                    </div>
                    <div className="min-w-0">
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">Wind</label>
                      <select
                        value={form.wind}
                        onChange={(e) => setForm({ ...form, wind: e.target.value as FormState["wind"] })}
                        className="w-full min-w-0 px-3 py-2.5 bg-gray-50 border-2 border-gray-200 rounded-xl text-sm !text-gray-900 focus:outline-none focus:border-primary focus:bg-white transition-colors"
                      >
                        <option value="">Select wind</option>
                        {WIND_OPTIONS.map((w) => (
                          <option key={w} value={w}>{w}</option>
                        ))}
                      </select>
                    </div>
                    <div className="min-w-0">
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">Incoming Date</label>
                      <input type="date" value={form.incomingDate} onChange={(e) => setForm({ ...form, incomingDate: e.target.value })} className="w-full min-w-0 px-3 py-2.5 bg-gray-50 border-2 border-gray-200 rounded-xl text-sm !text-gray-900 focus:outline-none focus:border-primary focus:bg-white transition-colors" />
                    </div>
                    <div className="min-w-0 sm:col-span-2">
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">Due On</label>
                      <input type="date" value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} className="w-full min-w-0 max-w-xs px-3 py-2.5 bg-gray-50 border-2 border-gray-200 rounded-xl text-sm !text-gray-900 focus:outline-none focus:border-primary focus:bg-white transition-colors" />
                    </div>
                  </div>
                  {editingId !== null && (
                    <div className="grid grid-cols-1 gap-3">
                      <div className="min-w-0">
                        <label className="block text-xs font-semibold text-gray-700 mb-1.5">Remarks</label>
                        <textarea value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} placeholder="Short remarks…" rows={2} className="w-full min-w-0 px-3 py-2.5 bg-gray-50 border-2 border-gray-200 rounded-xl text-sm !text-gray-900 !placeholder:text-gray-400 focus:outline-none focus:border-primary focus:bg-white transition-colors resize-none" />
                      </div>
                      <div className="min-w-0">
                        <label className="block text-xs font-semibold text-gray-700 mb-1.5">Comments</label>
                        <textarea value={form.comments} onChange={(e) => setForm({ ...form, comments: e.target.value })} placeholder="Additional comments…" rows={2} className="w-full min-w-0 px-3 py-2.5 bg-gray-50 border-2 border-gray-200 rounded-xl text-sm !text-gray-900 !placeholder:text-gray-400 focus:outline-none focus:border-primary focus:bg-white transition-colors resize-none" />
                      </div>
                    </div>
                  )}
                  <div className="min-w-0">
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">Priority</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(["Low", "Medium", "High"] as UiPriority[]).map((p) => {
                        const cfg = PRIORITY_CONFIG[p];
                        const sel = form.priority === p;
                        return (
                          <motion.button key={p} whileHover={{ y: -2 }} whileTap={{ scale: 0.96 }} onClick={() => setForm({ ...form, priority: p })} className={`min-w-0 p-2.5 rounded-xl border-2 flex items-center justify-center gap-1.5 transition-colors ${sel ? "border-primary bg-primary/5" : "border-gray-200 hover:border-gray-300"}`}>
                            <div className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
                            <span className={`text-xs font-semibold truncate ${sel ? "text-primary" : "text-gray-700"}`}>{p}</span>
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* MIDDLE COLUMN — Checklist */}
                <div className="space-y-3 min-w-0 md:border-l md:border-gray-100 md:pl-6">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Checklist</div>

                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-2">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Saved templates</div>
                    <div className="flex gap-2">
                      <select
                        value={selectedTemplateId}
                        onChange={(e) => setSelectedTemplateId(e.target.value)}
                        className="flex-1 px-3 py-2 bg-white border-2 border-gray-200 rounded-xl text-sm !text-gray-900 focus:outline-none focus:border-primary"
                      >
                        <option value="">Select template</option>
                        {savedTemplates.map((t) => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={applySavedTemplate}
                        disabled={!selectedTemplateId}
                        className="px-3 py-2 rounded-xl text-xs font-semibold bg-white border-2 border-gray-200 text-gray-700 disabled:opacity-50"
                      >
                        Apply
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <input
                        value={templateName}
                        onChange={(e) => setTemplateName(e.target.value)}
                        placeholder="Save current as template name"
                        className="flex-1 px-3 py-2 bg-white border-2 border-gray-200 rounded-xl text-sm !text-gray-900 !placeholder:text-gray-400 focus:outline-none focus:border-primary"
                      />
                      <button
                        type="button"
                        onClick={saveCurrentAsTemplate}
                        disabled={!templateName.trim() || checklistTemplate.length === 0 || savingTemplate}
                        className="px-3 py-2 rounded-xl text-xs font-semibold bg-primary text-white disabled:opacity-50"
                      >
                        Save
                      </button>
                    </div>
                  </div>

                  <div className="rounded-xl border-2 border-gray-200 bg-gray-50 p-4 space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">Attach checklist file</label>
                      <FileDropzone
                        compact
                        multiple
                        allowFolders
                        accept={CHECKLIST_FILE_ACCEPT}
                        label="Drag & drop checklist Word/PDF files"
                        hint="Word (.doc, .docx) and PDF only · each file becomes a checklist item"
                        onFiles={(files) => {
                          for (const f of files) addChecklistFromFile(f);
                        }}
                      />
                    </div>
                  </div>

                  <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                      <div className="text-xs font-bold text-gray-900">Attached checklist files</div>
                      <div className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                        {checklistTemplate.length}
                      </div>
                    </div>
                    {checklistTemplate.length === 0 ? (
                      <div className="px-4 py-8 text-center text-xs text-gray-400">No checklist files attached yet</div>
                    ) : (
                      <div className="divide-y divide-gray-50 max-h-[280px] overflow-y-auto">
                        {checklistTemplate.map((it, idx) => (
                          <div key={`${idx}-${it.text}`} className="px-4 py-3 flex items-start gap-3">
                            <div className="w-6 h-6 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-[11px] font-bold shrink-0">{idx + 1}</div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-semibold text-gray-900 truncate">{it.text}</div>
                              {it.desc && <div className="text-[11px] text-gray-500 mt-0.5">{it.desc}</div>}
                              <div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">Worker upload required</div>
                              {(checklistItemFiles[idx] ?? []).map((f) => (
                                <div key={f.name} className="mt-1 text-[11px] text-primary font-medium break-words whitespace-normal leading-snug flex items-start gap-1">
                                  <FileExtensionIcon fileName={f.name} size="sm" /> {f.name}
                                </div>
                              ))}
                            </div>
                            <button onClick={() => removeChecklistItem(idx)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* RIGHT COLUMN — Job Files */}
                <div className="min-w-0 md:col-span-2 xl:col-span-1 xl:border-l xl:border-gray-100 xl:pl-6 flex flex-col h-full min-h-0 gap-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500 shrink-0">Job Files</div>
                  <div className="shrink-0">
                    <FileDropzone
                      multiple
                      allowFolders
                      accept={JOB_FILE_ACCEPT}
                      label="Drag & drop job files or folders here"
                      hint="Any file type — photos, videos, CAD, documents · folders supported"
                      onFiles={(files) => addDroppedFiles(files)}
                    />
                  </div>
                  {existingAttachments.length > 0 && (
                    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden flex flex-col flex-1 min-h-0">
                      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between shrink-0">
                        <div className="text-xs font-bold text-gray-900">Existing files</div>
                        <div className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{existingAttachments.length}</div>
                      </div>
                      <div className="divide-y divide-gray-50 flex-1 min-h-0 overflow-y-auto">
                        {existingAttachments.map((f) => (
                          <div key={f.id} className="px-4 py-2.5 flex items-center gap-2">
                            <FileExtensionIcon fileName={f.fileName} size="sm" />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-semibold text-gray-900 break-words whitespace-normal leading-snug">{f.fileName}</div>
                              {formatStoredFileSize(f.fileSize) && (
                                <div className="text-[11px] text-gray-500">{formatStoredFileSize(f.fileSize)}</div>
                              )}
                            </div>
                            <div className="flex items-center gap-0.5 shrink-0">
                              {editingId && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    void downloadNamedFile(
                                      jobAttachmentDownloadUrl(editingId, f.id),
                                      f.fileName,
                                    ).catch(() => {
                                      window.alert("Download failed. Please try again.");
                                    });
                                  }}
                                  className="p-2 text-gray-400 hover:text-primary hover:bg-primary/5 rounded-lg"
                                  title="Download"
                                >
                                  <Download size={14} />
                                </button>
                              )}
                              {editingId && f.uploadedById === currentUser?.id && (
                                <button
                                  type="button"
                                  onClick={() => void deleteExistingAttachment(f)}
                                  className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                                  title="Delete"
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {jobFiles.length > 0 && (
                    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shrink-0">
                      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                        <div className="text-xs font-bold text-gray-900">Attached files</div>
                        <div className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/10 text-primary">{jobFiles.length}</div>
                      </div>
                      <div className="divide-y divide-gray-50 max-h-[220px] overflow-y-auto">
                        {jobFiles.map((f, idx) => (
                          <div key={`${f.name}-${f.size}-${idx}`} className="px-4 py-2.5 flex items-center gap-2">
                            <FileExtensionIcon fileName={f.name} size="sm" />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-semibold text-gray-900 break-words whitespace-normal leading-snug">{f.name}</div>
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
              )}
              <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2 bg-gray-50 shrink-0">
                <button onClick={closeModal} className="px-4 py-2 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors">Cancel</button>
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  disabled={isSaving || editLoading}
                  onClick={submit}
                  className="px-5 py-2 bg-primary hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-xl text-sm font-semibold shadow-md shadow-primary/30 transition-colors"
                >
                  {saveButtonLabel}
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
                  {workers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
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
