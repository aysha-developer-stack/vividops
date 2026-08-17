import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Loader2, Trash2, Download } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import type { Role } from "@/lib/roles";
import { useAuth } from "@/lib/auth";
import {
  useCreateJob,
  useUpdateJob,
  useListAssignableUsers,
  getListJobsQueryKey,
  getGetJobQueryKey,
  ApiError,
} from "@workspace/api-client-react";
import { PRIORITY_UI_TO_API, type UiPriority } from "@/lib/jobMappers";
import { serializeJobMeta, type ChecklistTemplateItem } from "@/lib/jobMeta";
import { downloadNamedFile, jobAttachmentDownloadUrl } from "@/lib/downloadFile";
import FileDropzone from "@/components/FileDropzone";
import DescriptionInput, { AddressUrlHint } from "@/components/DescriptionInput";
import {
  CHECKLIST_FILE_ACCEPT,
  isChecklistDocFile,
  filterJobFiles,
  JOB_FILE_ACCEPT,
  JOB_FILE_REJECTED_MESSAGE,
} from "@/lib/collectDroppedFiles";
import {
  applyJobToForm,
  EMPTY_JOB_FORM,
  formatFileSize,
  formatStoredFileSize,
  JOB_TITLE_OPTIONS,
  PRIORITY_BUTTON_CONFIG,
  todayJobDateInput,
  WIND_OPTIONS,
  type ExistingJobAttachment,
  type JobFormState,
  type JobWithChecklist,
} from "@/lib/jobForm";

type Props = {
  open: boolean;
  onClose: () => void;
  role: Role;
  /** When null, create a new job; otherwise edit the given job id. */
  jobId: string | null;
  jobNumberLabel?: string;
  onSaved?: (jobId: string) => void;
};

export default function JobFormModal({
  open,
  onClose,
  role,
  jobId,
  jobNumberLabel,
  onSaved,
}: Props) {
  const isEdit = jobId != null;
  const { user: currentUser } = useAuth();
  const qc = useQueryClient();
  const assignablesQuery = useListAssignableUsers();
  const createMutation = useCreateJob();
  const updateMutation = useUpdateJob();

  const [form, setForm] = useState<JobFormState>(EMPTY_JOB_FORM);
  const [assigneeMenuOpen, setAssigneeMenuOpen] = useState(false);
  const [jobFiles, setJobFiles] = useState<File[]>([]);
  const [existingAttachments, setExistingAttachments] = useState<ExistingJobAttachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [checklistTemplate, setChecklistTemplate] = useState<ChecklistTemplateItem[]>([]);
  const [checklistItemFiles, setChecklistItemFiles] = useState<Record<number, File[]>>({});
  const [checkPendingFile, setCheckPendingFile] = useState<File | null>(null);
  const [savedTemplates, setSavedTemplates] = useState<Array<{ id: string; name: string; items: ChecklistTemplateItem[] }>>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobNumberLoading, setJobNumberLoading] = useState(false);
  const assigneeMenuRef = useRef<HTMLDivElement>(null);

  const assignables = assignablesQuery.data ?? [];
  const workers = useMemo(
    () => assignables.filter((u) => u.role === "user"),
    [assignables],
  );
  const supervisors = useMemo(
    () => assignables.filter((u) => u.role === "supervisor"),
    [assignables],
  );

  const selectedWorkerIds = useMemo(
    () => Array.from(new Set([form.assigneeId, ...memberIds].filter((id): id is string => Boolean(id)))),
    [form.assigneeId, memberIds],
  );
  const selectedWorkerNames = useMemo(
    () => workers.filter((u) => selectedWorkerIds.includes(u.id)).map((u) => u.name),
    [workers, selectedWorkerIds],
  );

  const resetModal = useCallback(() => {
    setForm(EMPTY_JOB_FORM);
    setJobFiles([]);
    setExistingAttachments([]);
    setMemberIds([]);
    setChecklistTemplate([]);
    setChecklistItemFiles({});
    setCheckPendingFile(null);
    setUploadingFiles(false);
    setError(null);
    setAssigneeMenuOpen(false);
    setSelectedTemplateId("");
    setTemplateName("");
  }, []);

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

  const loadJobForEdit = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      let job: JobWithChecklist | undefined;
      const res = await fetch(`/api/jobs/${id}`, { credentials: "include" });
      if (res.ok) job = (await res.json()) as JobWithChecklist;
      if (!job) {
        setError("Failed to load job details");
        return;
      }

      let extras: string[] = [];
      try {
        const membersRes = await fetch(`/api/jobs/${id}/members`, { credentials: "include" });
        if (membersRes.ok) {
          const data = (await membersRes.json()) as unknown;
          if (Array.isArray(data)) {
            const assigneeId = job.assignee?.id ?? "";
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
        // optional
      }

      let attachments: ExistingJobAttachment[] = [];
      try {
        const attRes = await fetch(`/api/jobs/${id}/attachments`, { credentials: "include" });
        if (attRes.ok) {
          const attData = (await attRes.json()) as unknown;
          if (Array.isArray(attData)) {
            for (const a of attData) {
              if (!a || typeof a !== "object") continue;
              const row = a as Record<string, unknown>;
              const attId = typeof row.id === "string" ? row.id : "";
              if (!attId) continue;
              attachments.push({
                id: attId,
                fileName:
                  (typeof row.fileName === "string" ? row.fileName : "") ||
                  (typeof row.file_name === "string" ? row.file_name : "") ||
                  "File",
                fileSize:
                  typeof row.fileSize === "string"
                    ? row.fileSize
                    : typeof row.file_size === "string"
                      ? row.file_size
                      : undefined,
                fileUrl:
                  typeof row.fileUrl === "string"
                    ? row.fileUrl
                    : typeof row.file_url === "string"
                      ? row.file_url
                      : undefined,
              });
            }
          }
        }
      } catch {
        // optional
      }

      const applied = applyJobToForm(job, extras, role, currentUser?.id);
      setForm(applied.form);
      setChecklistTemplate(applied.checklist);
      setMemberIds(applied.memberIds);
      setExistingAttachments(attachments);
    } catch {
      setError("Failed to load job details");
    } finally {
      setLoading(false);
    }
  }, [role, currentUser?.id]);

  const loadCreateDefaults = useCallback(async () => {
    setLoading(true);
    setError(null);
    resetModal();
    setForm({
      ...EMPTY_JOB_FORM,
      incomingDate: todayJobDateInput(),
      supervisorId:
        role === "supervisor"
          ? (currentUser?.id ?? "")
          : (supervisors[0]?.id ?? ""),
    });
    setJobNumberLoading(true);
    try {
      const res = await fetch("/api/jobs/next-number", { credentials: "include" });
      if (res.ok) {
        const data = (await res.json()) as { jobNumber?: string };
        if (data.jobNumber) {
          setForm((prev) => ({ ...prev, jobNumber: data.jobNumber! }));
        }
      }
    } catch {
      // server assigns on create if preview fails
    } finally {
      setJobNumberLoading(false);
      setLoading(false);
    }
  }, [resetModal, role, currentUser?.id, supervisors]);

  useEffect(() => {
    if (!open) return;
    if (jobId) void loadJobForEdit(jobId);
    else void loadCreateDefaults();
  }, [open, jobId, loadJobForEdit, loadCreateDefaults]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/checklist-templates", { credentials: "include" });
        if (!res.ok) return;
        const data = (await res.json()) as Array<{ id: string; name: string; items: ChecklistTemplateItem[] }>;
        if (!cancelled && Array.isArray(data)) setSavedTemplates(data);
      } catch {
        // optional
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

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

  const handleClose = () => {
    resetModal();
    onClose();
  };

  const addDroppedFiles = (fileList: FileList | File[]) => {
    const picked = filterJobFiles(Array.from(fileList).filter((f) => f && typeof f.name === "string"));
    if (picked.length === 0) {
      setError(JOB_FILE_REJECTED_MESSAGE);
      return;
    }
    setError(null);
    setJobFiles((prev) => [...prev, ...picked]);
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
      return [...prev, { text, attachmentRequired: true }];
    });
    setCheckPendingFile(null);
    setError(null);
  };

  const removeChecklistItem = (idx: number) => {
    setChecklistTemplate((prev) => prev.filter((_, i) => i !== idx));
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

  const invalidateJobs = async (savedJobId: string) => {
    await qc.invalidateQueries({ queryKey: getListJobsQueryKey() });
    await qc.invalidateQueries({ queryKey: getGetJobQueryKey(savedJobId) });
  };

  const submit = async () => {
    if (!form.title || !form.client) {
      setError("Title and client are required");
      return;
    }
    const effectiveSupervisorId =
      role === "supervisor" ? (currentUser?.id ?? "") : form.supervisorId;
    if ((role === "super-admin" || role === "admin") && !effectiveSupervisorId) {
      setError("Supervisor is required");
      return;
    }

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

    const workerIds = new Set(workers.map((w) => w.id));
    const selectedValidWorkerIds = selectedWorkerIds.filter((id) => workerIds.has(id));
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
      remarks: isEdit ? (form.remarks.trim() || null) : null,
      comments: isEdit ? (form.comments.trim() || null) : null,
    };

    const syncMembers = async (savedId: string) => {
      const assigneeId = payload.assigneeId;
      const desired = Array.from(
        new Set(selectedValidWorkerIds.filter((id) => id && id !== assigneeId)),
      );
      try {
        const res = await fetch(`/api/jobs/${savedId}/members`, { credentials: "include" });
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
            await fetch(`/api/jobs/${savedId}/members/${id}`, { method: "DELETE", credentials: "include" });
          }
        }
        for (const id of desired) {
          if (!currentSet.has(id)) {
            await fetch(`/api/jobs/${savedId}/members`, {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ userId: id }),
            });
          }
        }
      } catch {
        // optional
      }
    };

    const uploadAllFiles = async (savedId: string) => {
      setUploadingFiles(true);
      try {
        for (const file of jobFiles) {
          const fd = new FormData();
          fd.append("file", file);
          fd.append("fileCategory", "job");
          const res = await fetch(`/api/jobs/${savedId}/attachments`, {
            method: "POST",
            body: fd,
            credentials: "include",
          });
          if (!res.ok) throw new Error(await res.text() || `Upload failed (${res.status})`);
        }
        for (const [indexStr, files] of Object.entries(finalChecklistFiles)) {
          const itemId = Number(indexStr) + 1;
          if (!Number.isFinite(itemId) || itemId <= 0) continue;
          for (const file of files) {
            const fd = new FormData();
            fd.append("file", file);
            fd.append("checklistItemId", String(itemId));
            const res = await fetch(`/api/jobs/${savedId}/attachments`, {
              method: "POST",
              body: fd,
              credentials: "include",
            });
            if (!res.ok) throw new Error(await res.text() || `Checklist file upload failed (${res.status})`);
          }
        }
      } finally {
        setUploadingFiles(false);
      }
    };

    try {
      let savedId = jobId;
      if (isEdit && jobId) {
        await updateMutation.mutateAsync({ id: jobId, data: payload });
        await uploadAllFiles(jobId);
        await syncMembers(jobId);
        await invalidateJobs(jobId);
      } else {
        const created = await createMutation.mutateAsync({ data: payload });
        savedId = created.id;
        await uploadAllFiles(created.id);
        await syncMembers(created.id);
        await invalidateJobs(created.id);
      }
      if (savedId) onSaved?.(savedId);
      handleClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Failed to save job");
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending || uploadingFiles;
  const subtitle = isEdit
    ? `${jobNumberLabel ?? (form.jobNumber ? `JOB-${form.jobNumber}` : "Job")} · Update job details`
    : "Assign a new job";

  if (!open) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => !isSaving && handleClose()}
          className="absolute inset-0 bg-black/50"
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: "spring", stiffness: 300, damping: 28 }}
          className="relative w-full max-w-[96vw] xl:max-w-7xl max-h-[92vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        >
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-primary/5 to-sky-50 shrink-0">
            <div>
              <h3 className="font-bold text-gray-900 text-base">{isEdit ? "Edit Job" : "Create New Job"}</h3>
              <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
            </div>
            <button type="button" onClick={() => !isSaving && handleClose()} className="p-1.5 rounded-lg hover:bg-gray-100">
              <X size={16} />
            </button>
          </div>
          {error && (
            <div className="px-6 py-3 bg-red-50 border-b border-red-100 text-sm text-red-700 shrink-0">{error}</div>
          )}
          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 py-16 text-gray-500">
              <Loader2 size={28} className="animate-spin text-primary" />
              <p className="text-sm">Loading job details…</p>
            </div>
          ) : (
            <div className="px-6 py-4 grid md:grid-cols-2 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)] gap-x-6 gap-y-4 overflow-y-auto">
              <div className="space-y-3 min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Job Details</div>
                <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)] gap-3">
                  <div className="min-w-0">
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">Job Number</label>
                    <input
                      value={form.jobNumber}
                      onChange={(e) => setForm({ ...form, jobNumber: e.target.value })}
                      placeholder={jobNumberLoading ? "Loading…" : "e.g. 154764"}
                      className="w-full min-w-0 px-3 py-2.5 bg-gray-50 border-2 border-gray-200 rounded-xl text-sm !text-gray-900 !placeholder:text-gray-400 focus:outline-none focus:border-primary focus:bg-white transition-colors"
                    />
                  </div>
                  <div className="min-w-0">
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">Job Title</label>
                    <input
                      list="job-form-title-options"
                      value={form.title}
                      onChange={(e) => setForm({ ...form, title: e.target.value })}
                      placeholder="Select or type a custom job title"
                      className="w-full min-w-0 px-3 py-2.5 bg-gray-50 border-2 border-gray-200 rounded-xl text-sm !text-gray-900 !placeholder:text-gray-400 focus:outline-none focus:border-primary focus:bg-white transition-colors"
                    />
                    <datalist id="job-form-title-options">
                      {JOB_TITLE_OPTIONS.map((option) => (
                        <option key={option} value={option} />
                      ))}
                    </datalist>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="min-w-0">
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">Client</label>
                    <input
                      value={form.client}
                      onChange={(e) => setForm({ ...form, client: e.target.value })}
                      placeholder="e.g. Anderson Residence"
                      className="w-full min-w-0 px-3 py-2.5 bg-gray-50 border-2 border-gray-200 rounded-xl text-sm !text-gray-900 !placeholder:text-gray-400 focus:outline-none focus:border-primary focus:bg-white transition-colors"
                    />
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
                        <option value="">Select supervisor</option>
                        {supervisors.map((u) => (
                          <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
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
                              {workers.map((u) => (
                                <label key={u.id} className="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={selectedWorkerIds.includes(u.id)}
                                    onChange={() => toggleWorkerSelection(u.id)}
                                    className="h-4 w-4"
                                  />
                                  <span className="text-sm text-gray-800 truncate">{u.name}</span>
                                </label>
                              ))}
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
                    key={`description-${jobId ?? "new"}`}
                    value={form.description}
                    onChange={(description) => setForm({ ...form, description })}
                    rows={4}
                  />
                </div>
                <div className="min-w-0">
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Job Address</label>
                  <input
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    placeholder="e.g. 120 Park Avenue, Sydney NSW 2000"
                    className="w-full min-w-0 px-3 py-2.5 bg-gray-50 border-2 border-gray-200 rounded-xl text-sm !text-gray-900 !placeholder:text-gray-400 focus:outline-none focus:border-primary focus:bg-white transition-colors"
                  />
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
                      value={isEdit ? "From job timer" : "Tracked on Job Detail"}
                      readOnly
                      className="w-full min-w-0 px-3 py-2.5 bg-gray-100 border-2 border-gray-200 rounded-xl text-sm !text-gray-500 cursor-not-allowed"
                    />
                  </div>
                  <div className="min-w-0">
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">Start Date</label>
                    <input
                      type="date"
                      value={form.startDate}
                      onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                      className="w-full min-w-0 px-3 py-2.5 bg-gray-50 border-2 border-gray-200 rounded-xl text-sm !text-gray-900 focus:outline-none focus:border-primary focus:bg-white transition-colors"
                    />
                  </div>
                  <div className="min-w-0">
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">ETA</label>
                    <input
                      type="date"
                      value={form.eta}
                      onChange={(e) => setForm({ ...form, eta: e.target.value })}
                      className="w-full min-w-0 px-3 py-2.5 bg-gray-50 border-2 border-gray-200 rounded-xl text-sm !text-gray-900 focus:outline-none focus:border-primary focus:bg-white transition-colors"
                    />
                  </div>
                  <div className="min-w-0">
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">Wind</label>
                    <select
                      value={form.wind}
                      onChange={(e) => setForm({ ...form, wind: e.target.value as JobFormState["wind"] })}
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
                    <input
                      type="date"
                      value={form.incomingDate}
                      onChange={(e) => setForm({ ...form, incomingDate: e.target.value })}
                      className="w-full min-w-0 px-3 py-2.5 bg-gray-50 border-2 border-gray-200 rounded-xl text-sm !text-gray-900 focus:outline-none focus:border-primary focus:bg-white transition-colors"
                    />
                  </div>
                  <div className="min-w-0 sm:col-span-2">
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">Due On</label>
                    <input
                      type="date"
                      value={form.due}
                      onChange={(e) => setForm({ ...form, due: e.target.value })}
                      className="w-full min-w-0 max-w-xs px-3 py-2.5 bg-gray-50 border-2 border-gray-200 rounded-xl text-sm !text-gray-900 focus:outline-none focus:border-primary focus:bg-white transition-colors"
                    />
                  </div>
                </div>
                {isEdit && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="min-w-0">
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">Remarks</label>
                      <textarea
                        value={form.remarks}
                        onChange={(e) => setForm({ ...form, remarks: e.target.value })}
                        placeholder="Short remarks…"
                        rows={2}
                        className="w-full min-w-0 px-3 py-2.5 bg-gray-50 border-2 border-gray-200 rounded-xl text-sm !text-gray-900 !placeholder:text-gray-400 focus:outline-none focus:border-primary focus:bg-white transition-colors resize-none"
                      />
                    </div>
                    <div className="min-w-0">
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">Comments</label>
                      <textarea
                        value={form.comments}
                        onChange={(e) => setForm({ ...form, comments: e.target.value })}
                        placeholder="Additional comments…"
                        rows={2}
                        className="w-full min-w-0 px-3 py-2.5 bg-gray-50 border-2 border-gray-200 rounded-xl text-sm !text-gray-900 !placeholder:text-gray-400 focus:outline-none focus:border-primary focus:bg-white transition-colors resize-none"
                      />
                    </div>
                  </div>
                )}
                <div className="min-w-0">
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Priority</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(["Low", "Medium", "High"] as UiPriority[]).map((p) => {
                      const cfg = PRIORITY_BUTTON_CONFIG[p];
                      const sel = form.priority === p;
                      return (
                        <motion.button
                          key={p}
                          type="button"
                          whileHover={{ y: -2 }}
                          whileTap={{ scale: 0.96 }}
                          onClick={() => setForm({ ...form, priority: p })}
                          className={`min-w-0 p-2.5 rounded-xl border-2 flex items-center justify-center gap-1.5 transition-colors ${sel ? "border-primary bg-primary/5" : "border-gray-200 hover:border-gray-300"}`}
                        >
                          <div className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
                          <span className={`text-xs font-semibold truncate ${sel ? "text-primary" : "text-gray-700"}`}>{p}</span>
                        </motion.button>
                      );
                    })}
                  </div>
                </div>
              </div>

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
                </div>
                <div className="rounded-xl border-2 border-gray-200 bg-gray-50 p-4 space-y-3">
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
                          </div>
                          <button
                            type="button"
                            onClick={() => removeChecklistItem(idx)}
                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-3 min-w-0 md:col-span-2 xl:col-span-1 xl:border-l xl:border-gray-100 xl:pl-6">
                <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Job Files</div>
                <FileDropzone
                  multiple
                  allowFolders
                  accept={JOB_FILE_ACCEPT}
                  label="Drag & drop job files or folders here"
                  hint="Drawings, instructions, site photos, or client docs"
                  onFiles={(files) => addDroppedFiles(files)}
                />
                {existingAttachments.length > 0 && (
                  <div className="bg-white rounded-xl border border-gray-100 overflow-hidden mb-3">
                    <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                      <div className="text-xs font-bold text-gray-900">Existing files</div>
                      <div className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{existingAttachments.length}</div>
                    </div>
                    <div className="divide-y divide-gray-50 max-h-[180px] overflow-y-auto">
                      {existingAttachments.map((f) => (
                        <div key={f.id} className="px-4 py-3 flex items-start gap-3">
                          <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center shrink-0 font-bold text-[10px]">FILE</div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-gray-900 break-words whitespace-normal leading-snug">{f.fileName}</div>
                            {formatStoredFileSize(f.fileSize) && (
                              <div className="text-[11px] text-gray-500">{formatStoredFileSize(f.fileSize)}</div>
                            )}
                          </div>
                          {jobId && (
                            <button
                              type="button"
                              onClick={() => {
                                void downloadNamedFile(jobAttachmentDownloadUrl(jobId, f.id), f.fileName).catch(() => {
                                  window.alert("Download failed. Please try again.");
                                });
                              }}
                              className="p-2 text-gray-400 hover:text-primary hover:bg-primary/5 rounded-lg"
                              title="Download"
                            >
                              <Download size={14} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {jobFiles.length > 0 && (
                  <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                      <div className="text-xs font-bold text-gray-900">New files to upload</div>
                      <div className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/10 text-primary">{jobFiles.length}</div>
                    </div>
                    <div className="divide-y divide-gray-50 max-h-[220px] overflow-y-auto">
                      {jobFiles.map((f, idx) => (
                        <div key={`${f.name}-${f.size}-${idx}`} className="px-4 py-3 flex items-start gap-3">
                          <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center shrink-0 font-bold text-[10px]">FILE</div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-gray-900 break-words whitespace-normal leading-snug">{f.name}</div>
                            <div className="text-[11px] text-gray-500">{formatFileSize(f.size)}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setJobFiles((prev) => prev.filter((_, i) => i !== idx))}
                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                          >
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
            <button type="button" onClick={handleClose} className="px-4 py-2 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors">
              Cancel
            </button>
            <motion.button
              type="button"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              disabled={isSaving || loading}
              onClick={() => void submit()}
              className="px-5 py-2 bg-primary hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-xl text-sm font-semibold shadow-md shadow-primary/30 transition-colors"
            >
              {isSaving ? "Saving…" : isEdit ? "Save changes" : "Create Job"}
            </motion.button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
