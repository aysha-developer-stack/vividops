import { useState, useEffect, useMemo, useRef } from "react";
import { Link, useRoute } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, MapPin, Calendar, User, Briefcase, CheckCircle2, Circle,
  Play, Pause, Square, Upload, FileText, Download, MessageCircle, Send,
  RefreshCw, AlertTriangle, Clock, Users, X, Edit2,
  Inbox, FolderOpen, MessageSquare, History, ChevronDown, Lock, ListChecks, Search, Eye
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import Pagination, { usePagination } from "@/components/Pagination";
import type { Role } from "@/lib/roles";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useGetJob,
  useUpdateJob,
  getGetJobQueryKey,
  getGetTimeLogsQueryKey,
  getListJobsQueryKey,
  useCreateTimeLog,
  useGetTimeLogs,
  type Job as ApiJob,
  ApiError,
} from "@workspace/api-client-react";
import { statusToUi, priorityToUi, formatShortDate } from "@/lib/jobMappers";
import { parseJobMeta, type ChecklistTemplateItem } from "@/lib/jobMeta";
import { postTimerNotification } from "@/lib/timerNotifications";
import { downloadNamedFile, jobAttachmentDownloadUrl, jobAttachmentPreviewUrl } from "@/lib/downloadFile";
import { useQueryClient } from "@tanstack/react-query";

interface Props { role?: Role; id?: string }

type ChecklistFileApi = {
  id: string;
  fileName: string;
  fileType: string | null;
  fileSize: string | null;
  fileUrl: string;
  uploadedBy: { id: string; name: string; role: Role } | null;
  createdAt: string;
};

interface ChecklistItem { 
  id: number; 
  text: string; 
  done: boolean; 
  desc?: string; 
  attachmentRequired?: boolean; 
  status: "pending" | "in_progress" | "completed" | "rework";
  reworkReason?: string;
  files?: ChecklistFileApi[];
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function slugifyCliqChannelPart(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

function buildFallbackCliqChannelName(job: ApiJob | undefined, jobId: string): string {
  const jobNumberSource = (job?.number || `job-${jobId}`).replace(/^job[\s-]*/i, "");
  const numberPart = `job-${slugifyCliqChannelPart(jobNumberSource) || jobId}`;
  const titlePart = slugifyCliqChannelPart(job?.title || "job");
  const addressPart = slugifyCliqChannelPart(job?.address || "");
  return [numberPart, titlePart, addressPart].filter(Boolean).join("-").slice(0, 80);
}

interface FileItem { id: number; name: string; size: string; type: "doc" | "image" | "pdf"; uploadedBy: string; uploadedAt: string; tag: "input" | "output"; version?: number; group?: string }

const INITIAL_FILES: FileItem[] = [];

type AttachmentApi = {
  id: string;
  jobId: string;
  fileName: string;
  fileKey: string;
  fileUrl: string;
  fileType: string | null;
  fileSize: string | null;
  uploadedById: string;
  createdAt: string;
  checklistItemId?: number | null;
  uploadedBy: { id: string; name: string; role: Role } | null;
};

interface FileNote { id: number; author: string; avatar: string; text: string; time: string; kind: "rework" | "comment" }

const INITIAL_NOTES: FileNote[] = [];

type JobMessageApi = {
  id: string;
  text: string;
  createdAt: string;
  isMe: boolean;
  source?: "app" | "zoho_cliq";
  deliveryState?: "local_only" | "sent" | "failed" | "received";
  user: { id: string; name: string };
};

type JobCliqChannelApi = {
  channelName: string;
  channelUrl: string | null;
  status: string;
};

const CLIQ_WEB_ROOT = "https://cliq.zoho.com.au";

type JobMessageUi = { id: string; user: string; avatar: string; text: string; time: string; isMe: boolean };

const INITIAL_MESSAGES: JobMessageUi[] = [];

const INITIAL_TIMER_LOGS: Array<{ id: string; user: string; duration: string; task: string; date: string }> = [];

type LocalChecklistState = {
  v: 1;
  items: Array<Pick<ChecklistItem, "id" | "done" | "status"> & { reworkReason?: string }>;
  uploads: Record<string, number>;
};

function checklistStorageKey(jobId: string) {
  return `jfm_job_${jobId}_checklist_v1`;
}

function readChecklistState(jobId: string): LocalChecklistState | null {
  try {
    const raw = localStorage.getItem(checklistStorageKey(jobId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const obj = parsed as Record<string, unknown>;
    if (obj.v !== 1) return null;
    if (!Array.isArray(obj.items)) return null;
    const uploads = (obj.uploads && typeof obj.uploads === "object") ? (obj.uploads as Record<string, number>) : {};
    const items = obj.items
      .map((x) => {
        if (!x || typeof x !== "object") return null;
        const i = x as Record<string, unknown>;
        const id = typeof i.id === "number" ? i.id : null;
        const done = typeof i.done === "boolean" ? i.done : null;
        const status = i.status === "pending" || i.status === "in_progress" || i.status === "completed" || i.status === "rework" ? i.status : null;
        const reworkReason = typeof i.reworkReason === "string" && i.reworkReason.trim() ? i.reworkReason.trim() : undefined;
        if (id == null || done == null || status == null) return null;
        return { id, done, status, ...(reworkReason ? { reworkReason } : {}) };
      })
      .filter((x): x is LocalChecklistState["items"][number] => x != null);
    return { v: 1, items, uploads };
  } catch {
    return null;
  }
}

function writeChecklistState(jobId: string, state: LocalChecklistState) {
  try {
    localStorage.setItem(checklistStorageKey(jobId), JSON.stringify(state));
  } catch {
  }
}

const TABS = [
  { id: "overview", label: "Overview", icon: Briefcase },
  { id: "checklist", label: "Checklist", icon: CheckCircle2 },
  { id: "files", label: "Files", icon: FileText },
  { id: "communication", label: "Chat", icon: MessageCircle },
  { id: "logs", label: "Timer Logs", icon: Clock },
] as const;

type TabId = typeof TABS[number]["id"];

const FILE_ICON: Record<FileItem["type"], string> = {
  doc: "bg-blue-50 text-blue-600",
  image: "bg-purple-50 text-purple-600",
  pdf: "bg-red-50 text-red-600",
};

function attachmentExtension(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

function canPreviewAttachment(fileName: string, fileType?: string | null): boolean {
  const ext = attachmentExtension(fileName);
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "pdf", "txt"].includes(ext)) return true;
  const mime = (fileType || "").toLowerCase();
  return mime.startsWith("image/") || mime === "application/pdf" || mime.startsWith("text/");
}

function fileTypeLabel(name: string): string {
  const ext = attachmentExtension(name);
  if (["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(ext)) return "Image";
  if (ext === "pdf") return "PDF";
  if (["zip", "rar", "7z"].includes(ext)) return "Archive";
  if (["doc", "docx"].includes(ext)) return "Word";
  if (["xls", "xlsx", "csv"].includes(ext)) return "Spreadsheet";
  if (ext === "txt") return "Text";
  return ext ? ext.toUpperCase() : "File";
}

function formatTime(s: number) {
  return `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function formatHoursMinutes(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const second = (parts[1]?.[0] ?? parts[0]?.[1] ?? "");
  return `${first}${second}`.toUpperCase();
}

export default function JobDetail({ role = "user", id }: Props) {
  const routePath = role === "supervisor" ? "/supervisor/jobs/:id"
    : role === "admin" ? "/admin/jobs/:id"
    : role === "super-admin" ? "/super-admin/jobs/:id"
    : "/user/jobs/:id";
  const [, params] = useRoute(routePath);
  const jobId = id || params?.id || "";
  const jobQuery = useGetJob(jobId);
  const updateJobMutation = useUpdateJob();
  const timeLogsQuery = useGetTimeLogs();
  const createTimeLogMutation = useCreateTimeLog();
  const qc = useQueryClient();
  const job = jobQuery.data;
  const meta = useMemo(() => {
    const parsed = parseJobMeta(job?.description);
    const apiChecklist = (job as ApiJob & { checklist?: ChecklistTemplateItem[] })?.checklist;
    const checklist =
      Array.isArray(apiChecklist) && apiChecklist.length > 0 ? apiChecklist : parsed.checklist;
    return { descriptionText: parsed.descriptionText, checklist };
  }, [job?.description, job]);
  const checklistTemplateKey = useMemo(() => JSON.stringify(meta.checklist), [meta.checklist]);
  const [attachments, setAttachments] = useState<AttachmentApi[]>([]);
  const [jobMembers, setJobMembers] = useState<Array<{ id: string; name: string; role: Role }>>([]);

  useEffect(() => {
    if (!job?.id) {
      setAttachments([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/jobs/${job.id}/attachments`, { credentials: "include" });
        if (!res.ok) {
          if (!cancelled) setAttachments([]);
          return;
        }
        const data = (await res.json()) as unknown;
        if (!Array.isArray(data)) {
          if (!cancelled) setAttachments([]);
          return;
        }
        if (!cancelled) setAttachments(data as AttachmentApi[]);
      } catch {
        if (!cancelled) setAttachments([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [job?.id]);

  useEffect(() => {
    if (!job?.id) {
      setJobMembers([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/jobs/${job.id}/members`, { credentials: "include" });
        if (!res.ok) return;
        const data = (await res.json()) as unknown;
        if (!Array.isArray(data)) return;
        if (!cancelled) setJobMembers(data as any[]);
      } catch {
      }
    })();
    return () => { cancelled = true; };
  }, [job?.id]);

  const tabFromQuery = (() => {
    try {
      const v = new URLSearchParams(window.location.search).get("tab");
      if (v === "overview" || v === "checklist" || v === "files" || v === "communication" || v === "logs") return v as TabId;
      return null;
    } catch {
      return null;
    }
  })();
  const defaultTab: TabId = tabFromQuery ?? (role === "supervisor" ? "overview" : "checklist");
  const [tab, setTab] = useState<TabId>(defaultTab);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [files, setFiles] = useState(INITIAL_FILES);
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [cliqChannel, setCliqChannel] = useState<JobCliqChannelApi | null>(null);
  const [draft, setDraft] = useState("");
  const [running, setRunning] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [reworkOpen, setReworkOpen] = useState(false);
  const [reworkReason, setReworkReason] = useState("");
  const [approveOpen, setApproveOpen] = useState(false);
  const [jobApproved, setJobApproved] = useState(false);
  const [showActivityPing, setShowActivityPing] = useState(false);
  const [autoStopCountdown, setAutoStopCountdown] = useState(300);
  const [fileSubTab, setFileSubTab] = useState<"input" | "output" | "notes">("input");
  const [fileSearch, setFileSearch] = useState("");
  const [previewAttachment, setPreviewAttachment] = useState<AttachmentApi | null>(null);
  const [notes, setNotes] = useState(INITIAL_NOTES);
  const [noteDraft, setNoteDraft] = useState("");
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [selectedChecklistItem, setSelectedChecklistItem] = useState<ChecklistItem | null>(null);
  const [checklistUploads, setChecklistUploads] = useState<Record<number, number>>({});
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [taskDialogValue, setTaskDialogValue] = useState("");
  const [taskDialogError, setTaskDialogError] = useState<string | null>(null);
  const taskDialogResolverRef = useRef<((task: string | null) => void) | null>(null);
  const intervalRef = useRef<number | null>(null);
  const pingTimerRef = useRef<number | null>(null);
  const autoStopRef = useRef<number | null>(null);
  const uploadChecklistIdRef = useRef<number | null>(null);
  const autoCompleteRef = useRef<string | null>(null);
  const PING_INTERVAL_S = 60 * 60;
  const AUTO_STOP_S = 5 * 60;

  const timerStorageKey = (jid: string) => `job_timer_v1:${jid}`;
  const readTimerState = (jid: string) => {
    try {
      const raw = localStorage.getItem(timerStorageKey(jid));
      if (!raw) return null;
      const data = JSON.parse(raw) as any;
      if (!data || data.v !== 1) return null;
      return {
        running: !!data.running,
        startedAt: typeof data.startedAt === "number" ? data.startedAt : null,
        accumulated: typeof data.accumulated === "number" ? data.accumulated : 0,
        task: typeof data.task === "string" ? data.task : "",
      };
    } catch {
      return null;
    }
  };
  const writeTimerState = (jid: string, state: { running: boolean; startedAt: number | null; accumulated: number; task?: string }) => {
    try {
      localStorage.setItem(timerStorageKey(jid), JSON.stringify({ v: 1, ...state }));
    } catch {
    }
  };
  const computeElapsed = (state: { running: boolean; startedAt: number | null; accumulated: number } | null) => {
    if (!state) return 0;
    const base = Math.max(0, Math.floor(state.accumulated));
    if (!state.running || !state.startedAt) return base;
    const extra = Math.max(0, Math.floor((Date.now() - state.startedAt) / 1000));
    return base + extra;
  };

  const readGlobalTimerState = () => {
    try {
      const raw = localStorage.getItem("global_timer_v1");
      if (!raw) return null;
      const data = JSON.parse(raw) as any;
      if (!data || data.v !== 1) return null;
      return {
        running: !!data.running,
        startedAt: typeof data.startedAt === "number" ? data.startedAt : null,
        accumulated: typeof data.accumulated === "number" ? data.accumulated : 0,
        task: typeof data.task === "string" ? data.task : "",
        jobId: typeof data.jobId === "string" ? data.jobId : "",
      };
    } catch {
      return null;
    }
  };

  const writeGlobalTimerState = (state: { running: boolean; startedAt: number | null; accumulated: number; task: string; jobId: string }) => {
    try {
      localStorage.setItem("global_timer_v1", JSON.stringify({ v: 1, ...state }));
    } catch {
    }
  };

  const stopOtherRunningTimersAndSave = async () => {
    const currentJobId = job?.id;

    const g = readGlobalTimerState();
    if (g?.running) {
      const elapsed = computeElapsed(g);
      if (elapsed > 0) {
        const jid = g.jobId?.trim() ? g.jobId : null;
        const task =
          g.task?.trim()
            ? g.task.trim()
            : jid
              ? `Work (Job ${jid.slice(0, 8)}…)`
              : null;
        try {
          if (task) {
            await createTimeLogMutation.mutateAsync({
              data: { task, duration: elapsed, jobId: jid },
            });
          }
        } catch {
        }
      }
      writeGlobalTimerState({ running: false, startedAt: null, accumulated: 0, task: "", jobId: "" });
    }

    const runningJobTimers: Array<{ jobId: string; elapsed: number }> = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith("job_timer_v1:")) continue;
      const jid = key.slice("job_timer_v1:".length);
      if (!jid || jid === currentJobId) continue;
      const state = readTimerState(jid);
      if (!state?.running) continue;
      const elapsed = computeElapsed(state);
      if (elapsed > 0) runningJobTimers.push({ jobId: jid, elapsed });
    }

    for (const jt of runningJobTimers) {
      const storedTask = readTimerState(jt.jobId)?.task?.trim() ?? "";
      try {
        await createTimeLogMutation.mutateAsync({
          data: {
            task: storedTask || `Work (Job ${jt.jobId.slice(0, 8)}…)`,
            duration: jt.elapsed,
            jobId: jt.jobId,
          },
        });
      } catch {
      }
      writeTimerState(jt.jobId, { running: false, startedAt: null, accumulated: 0, task: "" });
    }

    qc.invalidateQueries({ queryKey: getGetTimeLogsQueryKey() });
  };

  const requestTask = () => {
    setTaskDialogValue("");
    setTaskDialogError(null);
    setTaskDialogOpen(true);
    return new Promise<string | null>((resolve) => {
      taskDialogResolverRef.current = resolve;
    });
  };

  const resolveTaskDialog = (value: string | null) => {
    const r = taskDialogResolverRef.current;
    taskDialogResolverRef.current = null;
    setTaskDialogOpen(false);
    setTaskDialogValue("");
    setTaskDialogError(null);
    r?.(value);
  };

  const pauseTimer = () => {
    if (!job?.id) return;
    const state = readTimerState(job.id) ?? { running: false, startedAt: null, accumulated: 0, task: "" };
    const elapsed = computeElapsed(state);
    writeTimerState(job.id, { running: false, startedAt: null, accumulated: elapsed, task: state?.task ?? "" });
    setRunning(false);
    setSeconds(elapsed);
  };

  const startTimer = async () => {
    if (!job?.id) return;
    await stopOtherRunningTimersAndSave();
    const state = readTimerState(job.id) ?? { running: false, startedAt: null, accumulated: 0, task: "" };
    const existingTask = state.task?.trim() ?? "";
    const nextTask = existingTask || (await requestTask())?.trim() || "";
    if (!nextTask) return;
    const elapsed = computeElapsed(state);
    writeTimerState(job.id, { running: true, startedAt: Date.now(), accumulated: elapsed, task: nextTask });
    setRunning(true);
    setSeconds(elapsed);
  };

  useEffect(() => {
    if (job?.status !== "completed") return;
    setRunning(false);
    if (job?.id) {
      const state = readTimerState(job.id);
      const elapsed = computeElapsed(state);
      writeTimerState(job.id, { running: false, startedAt: null, accumulated: elapsed, task: state?.task ?? "" });
    }
  }, [job?.status]);

  useEffect(() => {
    if (role !== "user") return;
    if (!job?.id) return;
    const state = readTimerState(job.id);
    const elapsed = computeElapsed(state);
    setSeconds(elapsed);
    setRunning(!!state?.running);
  }, [role, job?.id]);

  useEffect(() => {
    if (!job?.id) return;

    const fromMeta = meta.checklist;
    const fromAttachments = (() => {
      const byItem = new Map<number, string>();
      for (const a of attachments) {
        if (a.checklistItemId == null) continue;
        const id = Number(a.checklistItemId);
        if (!Number.isFinite(id) || id <= 0) continue;
        if (!byItem.has(id)) byItem.set(id, a.fileName);
      }
      return [...byItem.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([id, fileName]) => ({ id, text: fileName, attachmentRequired: false as boolean | undefined }));
    })();

    const nextChecklist: ChecklistItem[] =
      fromMeta.length > 0
        ? fromMeta.map((t, idx) => ({
            id: idx + 1,
            text: t.text,
            done: false,
            desc: t.desc,
            attachmentRequired: t.attachmentRequired,
            status: "pending",
          }))
        : fromAttachments.map((t) => ({
            id: t.id,
            text: t.text,
            done: false,
            attachmentRequired: t.attachmentRequired,
            status: "pending" as const,
          }));

    let cancelled = false;
    (async () => {
      try {
        const userId = role === "user" ? null : (job?.assignee?.id ?? null);
        const url = userId ? `/api/jobs/${job.id}/checklist-state?userId=${encodeURIComponent(userId)}` : `/api/jobs/${job.id}/checklist-state`;
        const res = await fetch(url, { credentials: "include" });
        if (!res.ok) throw new Error("Failed");
        const data = (await res.json()) as unknown;
        const api = Array.isArray(data) ? (data as Array<{
          itemId: number;
          status: ChecklistItem["status"];
          reworkReason: string | null;
          attachmentCount: number;
          files?: ChecklistFileApi[];
        }>) : [];
        const byId = new Map<number, {
          status: ChecklistItem["status"];
          reworkReason?: string;
          attachmentCount: number;
          files: ChecklistFileApi[];
        }>();
        for (const r of api) {
          if (typeof r.itemId !== "number") continue;
          byId.set(r.itemId, {
            status: r.status,
            ...(typeof r.reworkReason === "string" && r.reworkReason.trim() ? { reworkReason: r.reworkReason } : {}),
            attachmentCount: typeof r.attachmentCount === "number" ? r.attachmentCount : 0,
            files: Array.isArray(r.files) ? r.files : [],
          });
        }

        // If still no template, create items from checklist-state file rows
        let base = nextChecklist;
        if (base.length === 0) {
          base = [...byId.entries()]
            .filter(([, v]) => v.files.length > 0)
            .sort((a, b) => a[0] - b[0])
            .map(([id, v]) => ({
              id,
              text: v.files[0]?.fileName ?? `Task ${id}`,
              done: false,
              status: "pending" as const,
              files: v.files,
            }));
        }

        const hydrated = base.map((c) => {
          const saved = byId.get(c.id);
          if (!saved) return c;
          return {
            ...c,
            done: saved.status === "completed",
            status: saved.status,
            files: saved.files.length > 0 ? saved.files : c.files,
            ...(saved.reworkReason ? { reworkReason: saved.reworkReason } : {}),
          };
        });
        const uploads: Record<number, number> = {};
        for (const [id, v] of byId.entries()) uploads[id] = v.attachmentCount ?? 0;
        // Count instruction files (admin uploads) separately from worker completion uploads —
        // show attached instruction files on the item either way.
        for (const a of attachments) {
          if (a.checklistItemId == null) continue;
          const id = Number(a.checklistItemId);
          if (!uploads[id]) uploads[id] = 0;
        }
        if (!cancelled) {
          setChecklist(hydrated);
          setChecklistUploads(uploads);
          setSelectedChecklistItem(null);
          uploadChecklistIdRef.current = null;
        }
      } catch {
        if (!cancelled) {
          setChecklist(nextChecklist);
          setSelectedChecklistItem(null);
          setChecklistUploads({});
          uploadChecklistIdRef.current = null;
        }
      }
    })();
    return () => { cancelled = true; };
  }, [job?.id, job?.description, checklistTemplateKey, role, job?.assignee?.id, job?.progress, job?.status, attachments]);

  // Trigger hourly check-in: every PING_INTERVAL_S of running time, show popup
  useEffect(() => {
    if (!running) {
      if (pingTimerRef.current) clearTimeout(pingTimerRef.current);
      return;
    }
    pingTimerRef.current = window.setTimeout(() => {
      setShowActivityPing(true);
      setAutoStopCountdown(AUTO_STOP_S);
      void postTimerNotification(
        "Still working?",
        `Your timer on ${job?.number ?? "this job"} has been running for 1 hour. Continue or stop within 5 minutes.`,
        job?.id,
      );
    }, PING_INTERVAL_S * 1000);
    return () => { if (pingTimerRef.current) clearTimeout(pingTimerRef.current); };
  }, [running, Math.floor(seconds / PING_INTERVAL_S)]);

  // Auto-stop countdown when popup is open
  useEffect(() => {
    if (!showActivityPing) {
      if (autoStopRef.current) clearInterval(autoStopRef.current);
      return;
    }
    autoStopRef.current = window.setInterval(() => {
      setAutoStopCountdown((c) => {
        if (c <= 1) {
          const duration = job?.id ? computeElapsed(readTimerState(job.id)) : seconds;
          setRunning(false);
          setSeconds(0);
          setShowActivityPing(false);
          if (job?.id) {
            writeTimerState(job.id, { running: false, startedAt: null, accumulated: 0, task: "" });
          }
          if (duration > 0 && job?.id) {
            const state = readTimerState(job.id);
            const t = state?.task?.trim() ? `Auto-stopped: ${state.task.trim()}` : "Auto-stopped (no response)";
            createTimeLogMutation.mutate(
              { data: { task: t, duration, jobId: job.id } },
              {
                onSettled: () => {
                  qc.invalidateQueries({ queryKey: getGetTimeLogsQueryKey() });
                  void postTimerNotification(
                    "Timer auto-stopped",
                    `Your timer was stopped automatically for ${job.number} (no response)`,
                    job.id,
                  );
                },
              },
            );
          }
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => { if (autoStopRef.current) clearInterval(autoStopRef.current); };
  }, [showActivityPing, seconds]);

  useEffect(() => {
    if (!running) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
      return;
    }
    intervalRef.current = window.setInterval(() => {
      if (!job?.id) return;
      const state = readTimerState(job.id);
      setSeconds(computeElapsed(state));
    }, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running, job?.id]);

  const completedCount = checklist.filter((c) => c.status === "completed").length;
  const checklistProgress = checklist.length > 0 ? Math.round((completedCount / checklist.length) * 100) : 0;
  const progress = Math.max(job?.progress ?? 0, checklistProgress);

  useEffect(() => {
    if (role !== "user") return;
    if (!job?.id) return;
    if (job.status === "completed" || job.status === "awaiting_supervisor" || job.status === "awaiting_admin") return;
    if (checklist.length === 0) return;
    if (completedCount < checklist.length) return;
    if (autoCompleteRef.current === job.id) return;
    autoCompleteRef.current = job.id;
    void fetch(`/api/jobs/${job.id}/review`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "submit_for_supervisor" }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as any).error || "Failed to submit for review");
        }
        await qc.invalidateQueries({ queryKey: getGetJobQueryKey(job.id) });
        await qc.invalidateQueries({ queryKey: getListJobsQueryKey() });
      })
      .catch(() => {
        autoCompleteRef.current = null;
      });
  }, [role, job?.id, job?.status, checklist.length, completedCount]);

  const jobTimeLogs = useMemo(() => {
    const all = timeLogsQuery.data ?? [];
    const jid = job?.id;
    if (!jid) return [];
    return all.filter((l) => l.jobId === jid);
  }, [timeLogsQuery.data, job?.id]);

  const totalLoggedSeconds = useMemo(() => {
    return jobTimeLogs.reduce((acc, l) => acc + (typeof l.duration === "number" ? l.duration : 0), 0);
  }, [jobTimeLogs]);

  const displaySeconds = totalLoggedSeconds + seconds;

  const jobLogRows = useMemo(() => {
    const assigneeId = job?.assignee?.id;
    const assigneeName = job?.assignee?.name ?? "User";
    return jobTimeLogs.map((l) => {
      const userName = l.userId === assigneeId ? assigneeName : `${l.userId.slice(0, 8)}…`;
      return {
        id: l.id,
        user: userName,
        duration: formatTime(l.duration ?? 0),
        task: l.task ?? "Work",
        date: l.createdAt ? new Date(l.createdAt as any).toLocaleString() : "—",
      };
    });
  }, [jobTimeLogs, job?.assignee?.id, job?.assignee?.name]);

  const jobLogsP = usePagination(jobLogRows, 6);

  useEffect(() => {
    if (!job?.id || tab !== "communication") return;
    let cancelled = false;

    const formatMsgTime = (iso: string) => {
      try {
        return new Date(iso).toLocaleString();
      } catch {
        return "—";
      }
    };

    const loadCliqChannel = async () => {
      try {
        const res = await fetch(`/api/jobs/${job.id}/cliq/channel`, { credentials: "include" });
        if (!res.ok) return;
        const data = (await res.json()) as unknown;
        if (!data || typeof data !== "object") return;
        const obj = data as Partial<JobCliqChannelApi>;
        if (!obj.channelName || typeof obj.channelName !== "string") return;
        if (!cancelled) {
          setCliqChannel({
            channelName: obj.channelName,
            channelUrl: typeof obj.channelUrl === "string" ? obj.channelUrl : null,
            status: typeof obj.status === "string" ? obj.status : "pending",
          });
        }
      } catch {
      }
    };

    const loadMessages = async () => {
      try {
        const res = await fetch(`/api/jobs/${job.id}/messages`, { credentials: "include" });
        if (!res.ok) return;
        const data = (await res.json()) as unknown;
        if (!Array.isArray(data)) return;
        const next = (data as JobMessageApi[])
          .filter((m) => m && typeof m === "object" && typeof m.id === "string" && typeof m.text === "string" && typeof m.createdAt === "string" && m.user && typeof m.user.name === "string")
          .map((m) => ({
            id: m.id,
            user: m.isMe ? "You" : m.user.name,
            avatar: initialsOf(m.user.name),
            text: m.text,
            time: formatMsgTime(m.createdAt),
            isMe: !!m.isMe,
          }));
        if (!cancelled) setMessages(next);
      } catch {
      }
    };

    void loadCliqChannel();
    void loadMessages();
    const poll = window.setInterval(() => {
      void loadMessages();
    }, 10000);

    return () => {
      cancelled = true;
      window.clearInterval(poll);
    };
  }, [job?.id, tab]);

  const persistLocalChecklist = (nextChecklist: ChecklistItem[], nextUploads: Record<number, number>) => {
    if (!job?.id) return;
    writeChecklistState(job.id, {
      v: 1,
      items: nextChecklist.map((c) => ({ id: c.id, done: c.done, status: c.status, ...(c.reworkReason ? { reworkReason: c.reworkReason } : {}) })),
      uploads: Object.fromEntries(Object.entries(nextUploads).map(([k, v]) => [String(k), v])),
    });
  };

  const toggleCheck = (id: number) => {
    const next = checklist.map((c) => c.id === id ? { ...c, done: !c.done } : c);
    setChecklist(next);
    persistLocalChecklist(next, checklistUploads);
  };
  const sendMessage = async () => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    if (!job?.id) return;
    try {
      const res = await fetch(`/api/jobs/${job.id}/messages`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, pushToCliq: true }),
      });
      if (!res.ok) return;
      const created = (await res.json()) as unknown;
      if (!created || typeof created !== "object") return;
      const m = created as JobMessageApi;
      if (typeof m.id !== "string" || typeof m.text !== "string" || typeof m.createdAt !== "string" || !m.user || typeof m.user.name !== "string") return;
      setMessages((prev) => [
        ...prev,
        {
          id: m.id,
          user: "You",
          avatar: initialsOf(m.user.name),
          text: m.text,
          time: (() => { try { return new Date(m.createdAt).toLocaleString(); } catch { return "—"; } })(),
          isMe: true,
        },
      ]);
    } catch {
    }
  };
  const inputPickerRef = useRef<HTMLInputElement>(null);
  const outputPickerRef = useRef<HTMLInputElement>(null);
  const reuploadPickerRef = useRef<HTMLInputElement>(null);
  const reuploadGroupRef = useRef<string | null>(null);
  const formatSize = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  const detectType = (name: string): FileItem["type"] => {
    const ext = attachmentExtension(name);
    if (["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(ext)) return "image";
    if (ext === "pdf") return "pdf";
    return "doc";
  };
  const attachmentViewUrl = (attachmentId: string, asAttachment = false) =>
    asAttachment
      ? jobAttachmentDownloadUrl(job?.id ?? "", attachmentId)
      : jobAttachmentPreviewUrl(job?.id ?? "", attachmentId);
  const downloadAttachment = (attachment: AttachmentApi) => {
    if (!job?.id) return;
    void downloadNamedFile(
      jobAttachmentDownloadUrl(job.id, attachment.id),
      attachment.fileName,
    ).catch(() => {
      window.alert("Download failed. Please try again.");
    });
  };
  const openAttachmentPreview = (attachment: AttachmentApi) => {
    if (!job?.id) return;
    if (!canPreviewAttachment(attachment.fileName, attachment.fileType)) {
      window.alert("This file type cannot be previewed in the browser. Please use Download.");
      return;
    }
    setPreviewAttachment(attachment);
  };
  const handleUpload = (tag: FileItem["tag"]) => {
    if (tag === "input") inputPickerRef.current?.click();
    else outputPickerRef.current?.click();
  };
  const handleChecklistUpload = (checklistId: number) => {
    uploadChecklistIdRef.current = checklistId;
    // Managers attach instruction/checklist docs; workers upload completed task files.
    if (role === "user") outputPickerRef.current?.click();
    else inputPickerRef.current?.click();
  };
  const refreshChecklistFiles = async () => {
    if (!job?.id) return;
    try {
      const userId = role === "user" ? null : (job?.assignee?.id ?? null);
      const url = userId ? `/api/jobs/${job.id}/checklist-state?userId=${encodeURIComponent(userId)}` : `/api/jobs/${job.id}/checklist-state`;
      const sres = await fetch(url, { credentials: "include" });
      if (!sres.ok) return;
      const sdata = (await sres.json()) as unknown;
      const api = Array.isArray(sdata) ? (sdata as Array<{
        itemId: number;
        status: ChecklistItem["status"];
        reworkReason: string | null;
        attachmentCount: number;
        files?: ChecklistFileApi[];
      }>) : [];
      const byId = new Map(api.map((r) => [r.itemId, r]));
      setChecklist((prev) =>
        prev.map((c) => {
          const saved = byId.get(c.id);
          if (!saved) return c;
          return {
            ...c,
            done: saved.status === "completed",
            status: saved.status,
            files: Array.isArray(saved.files) ? saved.files : [],
            ...(typeof saved.reworkReason === "string" && saved.reworkReason.trim()
              ? { reworkReason: saved.reworkReason }
              : {}),
          };
        }),
      );
      setSelectedChecklistItem((prev) => {
        if (!prev) return prev;
        const saved = byId.get(prev.id);
        if (!saved) return prev;
        return {
          ...prev,
          done: saved.status === "completed",
          status: saved.status,
          files: Array.isArray(saved.files) ? saved.files : [],
          ...(typeof saved.reworkReason === "string" && saved.reworkReason.trim()
            ? { reworkReason: saved.reworkReason }
            : {}),
        };
      });
      const uploads: Record<number, number> = {};
      for (const r of api) uploads[r.itemId] = r.attachmentCount ?? 0;
      setChecklistUploads((prev) => ({ ...prev, ...uploads }));
    } catch {
    }
  };
  const onPickerChange = (tag: FileItem["tag"]) => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (picked.length === 0) return;
    const checklistItemId = uploadChecklistIdRef.current;
    if (checklistItemId != null) {
      setChecklistUploads((prev) => {
        const next = { ...prev, [checklistItemId]: (prev[checklistItemId] ?? 0) + picked.length };
        persistLocalChecklist(checklist, next);
        return next;
      });
    }

    if (job?.id) {
      try {
        for (const f of picked) {
          const fd = new FormData();
          fd.append("file", f);
          if (checklistItemId != null) {
            fd.append("checklistItemId", String(checklistItemId));
          }
          const res = await fetch(`/api/jobs/${job.id}/attachments`, {
            method: "POST",
            body: fd,
            credentials: "include",
          });
          if (!res.ok) throw new Error("Upload failed");
        }
        uploadChecklistIdRef.current = null;
        const res = await fetch(`/api/jobs/${job.id}/attachments`, { credentials: "include" });
        if (res.ok) {
          const data = (await res.json()) as unknown;
          if (Array.isArray(data)) setAttachments(data as AttachmentApi[]);
        }
        if (checklistItemId != null) {
          await refreshChecklistFiles();
        }
        return;
      } catch {
        uploadChecklistIdRef.current = null;
      }
    }
    uploadChecklistIdRef.current = null;

    const me = role === "user" ? "Jordan Reed" : role === "supervisor" ? "Sam Carter" : "Admin";
    const newItems: FileItem[] = picked.map((f) => {
      const id = Date.now() + Math.random();
      if (tag === "output") {
        const group = `deliverable_${Math.floor(id)}`;
        return { id, name: f.name, size: formatSize(f.size), type: detectType(f.name), uploadedBy: me, uploadedAt: "Just now", tag, version: 1, group };
      }
      return { id, name: f.name, size: formatSize(f.size), type: detectType(f.name), uploadedBy: me, uploadedAt: "Just now", tag };
    });
    setFiles(tag === "input" ? [...newItems, ...files] : [...files, ...newItems]);
  };
  const reuploadVersion = (group: string) => {
    reuploadGroupRef.current = group;
    reuploadPickerRef.current?.click();
  };
  const onReuploadChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    const group = reuploadGroupRef.current;
    if (picked.length === 0 || !group) return;
    const lastVer = files.filter((f) => f.group === group).reduce((m, f) => Math.max(m, f.version ?? 0), 0);
    const me = role === "user" ? "Jordan Reed" : role === "supervisor" ? "Sam Carter" : "Admin";
    const sample = files.find((f) => f.group === group);
    const newVersions: FileItem[] = picked.map((f, idx) => ({
      id: Date.now() + idx,
      name: sample?.name ?? f.name,
      size: formatSize(f.size),
      type: sample?.type ?? detectType(f.name),
      uploadedBy: me,
      uploadedAt: "Just now",
      tag: "output",
      version: lastVer + 1 + idx,
      group,
    }));
    setFiles([...files, ...newVersions]);
    reuploadGroupRef.current = null;
  };

  const persistProgress = async (nextChecklist: ChecklistItem[]) => {
    if (!job?.id) return;
    const total = nextChecklist.length;
    const done = nextChecklist.filter((c) => c.status === "completed").length;
    const nextProgress = total > 0 ? Math.round((done / total) * 100) : 0;
    const shouldSubmitReview = total > 0 && done === total;
    const shouldAutoStart =
      job.status === "pending" && total > 0 && done > 0;
    const shouldUpdateProgress = (job.progress ?? 0) !== nextProgress;
    const nextStatus =
      shouldSubmitReview ? ("awaiting_supervisor" as const)
      : shouldAutoStart ? ("in_progress" as const)
      : null;
    const shouldUpdateStatus = nextStatus != null && job.status !== nextStatus;
    if (!shouldUpdateProgress && !shouldUpdateStatus) return;
    try {
      if (shouldSubmitReview) {
        const res = await fetch(`/api/jobs/${job.id}/review`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "submit_for_supervisor" }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as any).error || "Failed to submit for review");
        }
        if (shouldUpdateProgress) {
          await updateJobMutation.mutateAsync({
            id: job.id,
            data: { progress: nextProgress },
          });
        }
      } else {
        await updateJobMutation.mutateAsync({
          id: job.id,
          data: {
            ...(shouldUpdateProgress ? { progress: nextProgress } : {}),
            ...(shouldUpdateStatus ? { status: nextStatus as any } : {}),
          },
        });
      }
      await qc.invalidateQueries({ queryKey: getGetJobQueryKey(job.id) });
      await qc.invalidateQueries({ queryKey: getListJobsQueryKey() });
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Failed to update progress";
      console.error(msg);
    }
  };

  const stopAndSaveTimeLog = async (task: string) => {
    if (!job?.id) return;
    const duration = computeElapsed(readTimerState(job.id));
    const storedTask = readTimerState(job.id)?.task?.trim() ?? "";
    const t = task.trim() || storedTask || `Work (Job ${job.id.slice(0, 8)}…)`;
    setRunning(false);
    setSeconds(0);
    setShowActivityPing(false);
    writeTimerState(job.id, { running: false, startedAt: null, accumulated: 0, task: "" });
    if (duration <= 0) return;
    try {
      await createTimeLogMutation.mutateAsync({ data: { task: t, duration, jobId: job.id } });
      await qc.invalidateQueries({ queryKey: getGetTimeLogsQueryKey() });
    } catch {
    }
  };

  return (
    <DashboardLayout title="Job Details" role={role}>
      <input ref={inputPickerRef} type="file" multiple className="hidden" onChange={onPickerChange("input")} />
      <input ref={outputPickerRef} type="file" multiple className="hidden" onChange={onPickerChange("output")} />
      {/* Back link */}
      <Link
        href={
          role === "supervisor"
            ? "/supervisor/jobs"
            : role === "admin"
            ? "/admin/jobs"
            : role === "super-admin"
            ? "/super-admin/jobs"
            : "/user/jobs"
        }
      >
        <motion.button whileHover={{ x: -3 }} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-primary mb-4">
          <ArrowLeft size={14} /> Back to jobs
        </motion.button>
      </Link>

      {/* Job header card */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative bg-white rounded-2xl border border-gray-100 p-6 mb-6 overflow-hidden"
      >
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-sky-400 to-primary" />
        <div className="flex items-start justify-between flex-wrap gap-4 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold text-primary tracking-wider">{job?.number ?? jobId}</span>
              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20`}>
                {job ? statusToUi(job) : jobQuery.isLoading ? "Loading" : "—"}
              </span>
              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200`}>
                {job ? priorityToUi(job.priority) : "—"} Priority
              </span>
            </div>
            <h2 className="text-2xl font-bold text-gray-900">{job?.title ?? (jobQuery.isLoading ? "Loading…" : "Job")}</h2>
            <div className="text-sm text-gray-500 mt-1">{job?.client ?? "—"}</div>
          </div>
          <div className="flex gap-2">
            {role === "supervisor" && (
              <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-semibold">
                <Edit2 size={12} /> Edit
              </motion.button>
            )}
            {role === "supervisor" && (
              <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="flex items-center gap-2 px-3 py-2 bg-primary hover:bg-primary/90 text-white rounded-xl text-xs font-semibold shadow-md shadow-primary/30">
                <Users size={12} /> Reassign
              </motion.button>
            )}
            {(role === "supervisor" || role === "admin" || role === "super-admin") && job?.status !== "completed" && job?.status !== "cancelled" && (
              <>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setReworkOpen(true)}
                  className="flex items-center gap-2 px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-xl text-xs font-semibold"
                >
                  <RefreshCw size={12} /> Mark for Rework
                </motion.button>
                {role === "supervisor" && job?.status !== "awaiting_admin" && (
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setApproveOpen(true)}
                    className="flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-md shadow-emerald-600/30"
                  >
                    <CheckCircle2 size={12} /> Approve for Admin
                  </motion.button>
                )}
                {(role === "admin" || role === "super-admin") && (
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setApproveOpen(true)}
                    className="flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-md shadow-emerald-600/30"
                  >
                    <CheckCircle2 size={12} /> Complete Job
                  </motion.button>
                )}
              </>
            )}
            {role === "user" && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => handleUpload("output")}
                className="flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/30"
                title="Quick upload completed files"
              >
                <Upload size={12} /> Upload Completed Files
              </motion.button>
            )}
          </div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4 pt-4 border-t border-gray-100">
          <div className="flex items-start gap-2.5"><MapPin size={14} className="text-gray-400 mt-0.5" />
            <div><div className="text-[10px] text-gray-500 uppercase font-semibold">Location</div><div className="text-sm text-gray-900 font-medium">{job?.address ?? "—"}</div></div>
          </div>
          <div className="flex items-start gap-2.5"><Calendar size={14} className="text-gray-400 mt-0.5" />
            <div><div className="text-[10px] text-gray-500 uppercase font-semibold">Date Created</div><div className="text-sm text-gray-900 font-medium">{job?.createdAt ? formatShortDate(job.createdAt as any) : "—"}</div></div>
          </div>
          <div className="flex items-start gap-2.5"><Clock size={14} className="text-amber-500 mt-0.5" />
            <div><div className="text-[10px] text-gray-500 uppercase font-semibold">Est. Completion</div><div className="text-sm text-gray-900 font-medium">{job?.dueDate ? new Date(job.dueDate as any).toLocaleString() : "TBD"}</div></div>
          </div>
          <div className="flex items-start gap-2.5"><CheckCircle2 size={14} className={`mt-0.5 ${job?.completedAt ? "text-emerald-500" : "text-gray-300"}`} />
            <div><div className="text-[10px] text-gray-500 uppercase font-semibold">Date Completed</div><div className={`text-sm font-medium ${job?.completedAt ? "text-gray-900" : "text-gray-400 italic"}`}>{job?.completedAt ? new Date(job.completedAt as any).toLocaleString() : "Not yet completed"}</div></div>
          </div>
          <div className="flex items-start gap-2.5"><User size={14} className="text-gray-400 mt-0.5" />
            <div><div className="text-[10px] text-gray-500 uppercase font-semibold">Assigned User</div><div className="text-sm text-gray-900 font-medium">{job?.assignee?.name ?? "Unassigned"}</div></div>
          </div>
        </div>

        {/* Progress */}
        <div className="mt-5 pt-4 border-t border-gray-100">
          <div className="flex justify-between text-xs mb-1.5">
            <span className="font-semibold text-gray-700">Job progress</span>
            <span className="font-bold text-primary">{progress}% · {completedCount}/{checklist.length} tasks</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <motion.div className="h-full bg-primary rounded-full" initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ duration: 0.8, ease: "easeOut" }} />
          </div>
        </div>
      </motion.div>

      {/* Start Work / Timer card (USER only or visible on overview) */}
      {role === "user" && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="relative bg-gradient-to-br from-primary via-sky-700 to-primary rounded-2xl p-6 mb-6 overflow-hidden shadow-xl shadow-primary/20"
        >
          <motion.div
            className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-white/10 blur-2xl"
            animate={{ scale: running ? [1, 1.3, 1] : 1, opacity: running ? [0.3, 0.6, 0.3] : 0.3 }}
            transition={{ duration: 2, repeat: Infinity }}
          />
          <div className="relative z-10 flex items-center justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-2 h-2 rounded-full ${running ? "bg-emerald-300 animate-pulse" : "bg-white/40"}`} />
                <span className="text-xs font-bold text-white/80 uppercase tracking-wider">{running ? "Tracking time" : "Ready to work"}</span>
              </div>
              <div className="font-mono text-4xl md:text-5xl font-bold text-white tabular-nums">{formatTime(displaySeconds)}</div>
            </div>
            <div className="flex gap-2">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  if (job?.status === "completed") return;
                  if (running) pauseTimer();
                  else void startTimer();
                }}
                disabled={job?.status === "completed"}
                className="flex items-center gap-2 px-5 py-2.5 bg-white text-primary rounded-xl text-sm font-bold shadow-lg disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {running ? <><Pause size={14} /> Pause</> : <><Play size={14} fill="currentColor" /> Start Work</>}
              </motion.button>
              {seconds > 0 && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => { void stopAndSaveTimeLog("Manually stopped"); }}
                  className="flex items-center gap-2 px-5 py-2.5 bg-white/10 border border-white/20 text-white rounded-xl text-sm font-semibold hover:bg-white/20"
                >
                  <Square size={12} /> Stop
                </motion.button>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-5 overflow-x-auto">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <motion.button
              key={t.id}
              whileTap={{ scale: 0.97 }}
              onClick={() => setTab(t.id)}
              className={`relative flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${active ? "text-white" : "text-gray-600 hover:text-gray-900"}`}
            >
              {active && <motion.div layoutId="jobTab" className="absolute inset-0 bg-primary rounded-lg pointer-events-none" transition={{ type: "spring", stiffness: 300, damping: 25 }} />}
              <span className="relative flex items-center gap-2"><Icon size={14} /> {t.label}</span>
            </motion.button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        {tab === "overview" && (
          <motion.div key="ov" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 p-6">
              <h3 className="font-bold text-gray-900 mb-2">Description</h3>
              <p className="text-sm text-gray-600 leading-relaxed">{meta.descriptionText || "—"}</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2"><Users size={16} className="text-primary" /> People</h3>
              {jobMembers.length === 0 ? (
                <div className="text-xs text-gray-400 py-6 text-center">No people assigned yet</div>
              ) : (
                jobMembers.map((w, i) => (
                  <motion.div key={w.id} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50">
                    <div className="relative">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-sky-700 text-white text-xs font-bold flex items-center justify-center">{initialsOf(w.name)}</div>
                      <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full ring-2 ring-white bg-gray-300" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-gray-900 truncate">{w.name}</div>
                      <div className="text-[11px] text-gray-500">
                        {w.role === "super-admin" ? "Super Admin"
                          : w.role === "admin" ? "Admin"
                          : w.role === "supervisor" ? "Supervisor"
                          : w.id === job?.assignee?.id ? "Assignee"
                          : "Worker"}
                      </div>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </motion.div>
        )}

        {tab === "checklist" && (
          <motion.div key="cl" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 overflow-hidden h-fit">
              <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-gray-900">Task Checklist</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {checklist.length === 0
                      ? "No checklist set for this job. Supervisor/Admin creates the checklist in Job Management (Create/Edit Job)."
                      : `${completedCount} of ${checklist.length} tasks completed`}
                  </p>
                </div>
                <div className="text-2xl font-bold text-primary">{progress}%</div>
              </div>
              <div className="divide-y divide-gray-50">
                {checklist.length === 0 ? (
                  <div className="px-6 py-12 text-center text-xs text-gray-400">Checklist will appear here once the job is configured.</div>
                ) : (
                  checklist.map((c, i) => (
                    <motion.button
                      key={c.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.04 }}
                      whileHover={{ backgroundColor: "rgb(249,250,251)" }}
                      onClick={() => setSelectedChecklistItem(c)}
                      className={`w-full flex items-center gap-4 px-5 py-4 text-left group transition-colors ${selectedChecklistItem?.id === c.id ? "bg-primary/5 border-l-4 border-l-primary" : "border-l-4 border-l-transparent"}`}
                    >
                      <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 transition-colors ${c.status === "completed" ? "bg-emerald-500 border-emerald-500" : c.status === "rework" ? "bg-purple-500 border-purple-500" : c.status === "in_progress" ? "bg-primary/10 border-primary" : "border-gray-300"}`}>
                        {c.status === "completed" ? <CheckCircle2 size={14} className="text-white" /> : c.status === "rework" ? <RefreshCw size={14} className="text-white" /> : c.status === "in_progress" ? <div className="w-2 h-2 rounded-full bg-primary animate-pulse" /> : null}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-bold transition-colors ${c.status === "completed" ? "text-gray-400 line-through" : "text-gray-900"}`}>{c.text}</div>
                        <div className="text-[10px] font-bold uppercase tracking-wider mt-0.5 flex items-center gap-2">
                          <span className={`${c.status === "completed" ? "text-emerald-600" : c.status === "rework" ? "text-purple-600" : c.status === "in_progress" ? "text-primary" : "text-gray-400"}`}>
                            {c.status.replace("_", " ")}
                          </span>
                          {c.attachmentRequired && <span className="text-gray-400 flex items-center gap-1"><Upload size={10} /> File required</span>}
                        </div>
                        {(c.files ?? []).length > 0 && (
                          <div className="mt-2 space-y-1" onClick={(e) => e.stopPropagation()}>
                            {(c.files ?? []).map((f) => (
                              <div key={f.id} className="flex items-center gap-2 rounded-lg bg-gray-50 border border-gray-100 px-2.5 py-1.5">
                                <FileText size={12} className="text-primary shrink-0" />
                                <span className="text-[11px] font-medium text-gray-700 truncate flex-1">{f.fileName}</span>
                                <button
                                  type="button"
                                  onClick={() => openAttachmentPreview({
                                    id: f.id,
                                    jobId: job?.id ?? "",
                                    fileName: f.fileName,
                                    fileKey: "",
                                    fileUrl: f.fileUrl,
                                    fileType: f.fileType,
                                    fileSize: f.fileSize,
                                    uploadedById: f.uploadedBy?.id ?? "",
                                    createdAt: f.createdAt,
                                    uploadedBy: f.uploadedBy,
                                  })}
                                  className="p-1 text-gray-400 hover:text-primary rounded"
                                  title="Preview"
                                >
                                  <Eye size={12} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => downloadAttachment({
                                    id: f.id,
                                    jobId: job?.id ?? "",
                                    fileName: f.fileName,
                                    fileKey: "",
                                    fileUrl: f.fileUrl,
                                    fileType: f.fileType,
                                    fileSize: f.fileSize,
                                    uploadedById: f.uploadedBy?.id ?? "",
                                    createdAt: f.createdAt,
                                    uploadedBy: f.uploadedBy,
                                  })}
                                  className="p-1 text-gray-400 hover:text-primary rounded"
                                  title="Download"
                                >
                                  <Download size={12} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <ChevronDown size={16} className="-rotate-90 text-gray-300 group-hover:text-gray-400" />
                    </motion.button>
                  ))
                )}
              </div>
            </div>

            <AnimatePresence mode="wait">
              {selectedChecklistItem ? (
                <motion.div
                  key={selectedChecklistItem.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="bg-white rounded-2xl border border-gray-100 overflow-hidden flex flex-col h-fit sticky top-6"
                >
                  <div className="p-5 border-b border-gray-100 bg-gray-50/50">
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${selectedChecklistItem.status === "completed" ? "bg-emerald-50 text-emerald-700" : selectedChecklistItem.status === "rework" ? "bg-purple-50 text-purple-700" : "bg-primary/10 text-primary"}`}>
                        {selectedChecklistItem.status.replace("_", " ")}
                      </span>
                      <button onClick={() => setSelectedChecklistItem(null)} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
                    </div>
                    <h4 className="font-bold text-gray-900">{selectedChecklistItem.text}</h4>
                    <p className="text-xs text-gray-500 mt-1">{selectedChecklistItem.desc}</p>
                  </div>
                  
                  <div className="p-5 space-y-5">
                    {selectedChecklistItem.status === "rework" && (
                      <div className="p-3 rounded-xl bg-purple-50 border border-purple-100">
                        <div className="flex items-center gap-2 text-purple-700 font-bold text-[10px] uppercase mb-1">
                          <AlertTriangle size={12} /> Rework Reason
                        </div>
                        <p className="text-xs text-purple-900 mb-3">{selectedChecklistItem.reworkReason ?? "Please review the requirements and resubmit."}</p>
                        <button 
                          onClick={() => handleChecklistUpload(selectedChecklistItem.id)}
                          className="w-full py-2 bg-purple-600 text-white text-[10px] font-bold rounded-lg shadow-md shadow-purple-600/20 flex items-center justify-center gap-2 hover:bg-purple-700 transition-colors"
                        >
                          <Upload size={12} /> Upload Rework File
                        </button>
                      </div>
                    )}

                    <div>
                      <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-3">Task Details</div>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-500">Assigned User</span>
                          <span className="font-bold text-gray-900">{job?.assignee?.name ?? "Unassigned"}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-500">Due Date</span>
                          <span className="font-bold text-gray-900">{job?.dueDate ? formatShortDate(job.dueDate as any) : "TBD"}</span>
                        </div>
                      </div>
                    </div>

                    <div>
                      <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-3">Checklist Files</div>
                      {(selectedChecklistItem.files ?? []).length === 0 ? (
                        <p className="text-[11px] text-gray-400 mb-3">No files attached to this checklist item yet.</p>
                      ) : (
                        <div className="space-y-2 mb-3">
                          {(selectedChecklistItem.files ?? []).map((f) => (
                            <div key={f.id} className="flex items-center gap-2 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                              <FileText size={14} className="text-primary shrink-0" />
                              <div className="flex-1 min-w-0">
                                <div className="text-xs font-semibold text-gray-900 truncate">{f.fileName}</div>
                                <div className="text-[10px] text-gray-500">{f.uploadedBy?.name ?? "—"}</div>
                              </div>
                              <button
                                type="button"
                                onClick={() => openAttachmentPreview({
                                  id: f.id,
                                  jobId: job?.id ?? "",
                                  fileName: f.fileName,
                                  fileKey: "",
                                  fileUrl: f.fileUrl,
                                  fileType: f.fileType,
                                  fileSize: f.fileSize,
                                  uploadedById: f.uploadedBy?.id ?? "",
                                  createdAt: f.createdAt,
                                  uploadedBy: f.uploadedBy,
                                })}
                                className="p-1.5 text-gray-400 hover:text-primary rounded-lg"
                                title="Preview"
                              >
                                <Eye size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => downloadAttachment({
                                  id: f.id,
                                  jobId: job?.id ?? "",
                                  fileName: f.fileName,
                                  fileKey: "",
                                  fileUrl: f.fileUrl,
                                  fileType: f.fileType,
                                  fileSize: f.fileSize,
                                  uploadedById: f.uploadedBy?.id ?? "",
                                  createdAt: f.createdAt,
                                  uploadedBy: f.uploadedBy,
                                })}
                                className="p-1.5 text-gray-400 hover:text-primary rounded-lg"
                                title="Download"
                              >
                                <Download size={14} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      <button
                        onClick={() => handleChecklistUpload(selectedChecklistItem.id)}
                        className="w-full py-2 bg-primary text-white text-[11px] font-bold rounded-lg shadow-md shadow-primary/20 flex items-center justify-center gap-2"
                      >
                        <Upload size={12} /> Upload Checklist File
                      </button>
                    </div>

                    {selectedChecklistItem.attachmentRequired && (
                      <div>
                        <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-3">Mandatory Worker Upload</div>
                        <div className="p-4 border-2 border-dashed border-gray-100 rounded-xl bg-gray-50/50 flex flex-col items-center justify-center text-center">
                          <div className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center text-primary mb-2">
                            <Upload size={18} />
                          </div>
                          <div className="text-xs font-bold text-gray-900">Worker must upload a file</div>
                          <p className="text-[10px] text-gray-500 mt-1 max-w-[160px]">Completion uploads for this task.</p>
                          <div className="mt-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                            Uploaded: {checklistUploads[selectedChecklistItem.id] ?? 0}
                          </div>
                        </div>
                      </div>
                    )}

                    <div>
                      <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Comments</div>
                      <textarea className="w-full bg-gray-50 border-2 border-gray-100 rounded-xl p-3 text-xs !text-gray-900 !placeholder:text-gray-400 focus:outline-none focus:border-primary resize-none h-24" placeholder="Add notes about this task..." />
                    </div>

                    <div className="flex flex-wrap gap-2 pt-2">
                      {selectedChecklistItem.status !== "completed" && role === "user" && (
                        <button 
                          onClick={async () => {
                            const needsFile = !!selectedChecklistItem.attachmentRequired;
                            const uploadedCount = checklistUploads[selectedChecklistItem.id] ?? 0;
                            if (needsFile && uploadedCount === 0) {
                              alert("Upload a checklist file before marking this item complete.");
                              return;
                            }
                            if (!job?.id) return;
                            try {
                              const res = await fetch(`/api/jobs/${job.id}/checklist-state`, {
                                method: "PATCH",
                                credentials: "include",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ itemId: selectedChecklistItem.id, status: "completed" }),
                              });
                              if (!res.ok) {
                                const data = await res.json().catch(() => ({}));
                                throw new Error((data as any).error || "Failed to mark complete");
                              }
                              const next = checklist.map((i) =>
                                i.id === selectedChecklistItem.id ? { ...i, status: "completed" as const, done: true } : i
                              );
                              setChecklist(next);
                              setSelectedChecklistItem({ ...selectedChecklistItem, status: "completed" as const, done: true });
                              persistLocalChecklist(next, checklistUploads);
                              await persistProgress(next);
                              await qc.invalidateQueries({ queryKey: getGetJobQueryKey(job.id) });
                              await qc.invalidateQueries({ queryKey: getListJobsQueryKey() });
                            } catch (err) {
                              alert(err instanceof Error ? err.message : "Failed to mark complete");
                            }
                          }}
                          disabled={!!selectedChecklistItem.attachmentRequired && (checklistUploads[selectedChecklistItem.id] ?? 0) === 0}
                          className={`flex-1 py-2.5 text-white text-xs font-bold rounded-xl shadow-lg flex items-center justify-center gap-2 transition-colors ${
                            !!selectedChecklistItem.attachmentRequired && (checklistUploads[selectedChecklistItem.id] ?? 0) === 0
                              ? "bg-gray-300 shadow-gray-200 cursor-not-allowed"
                              : "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20"
                          }`}
                        >
                          <CheckCircle2 size={14} /> Mark Complete
                        </button>
                      )}
                      {selectedChecklistItem.status !== "completed" && role !== "user" && (
                        <button 
                          onClick={async () => {
                            const next = checklist.map((i) =>
                              i.id === selectedChecklistItem.id ? { ...i, status: "completed" as const, done: true } : i
                            );
                            setChecklist(next);
                            setSelectedChecklistItem({ ...selectedChecklistItem, status: "completed" as const, done: true });
                            persistLocalChecklist(next, checklistUploads);
                            if (job?.id) {
                              try {
                                const res = await fetch(`/api/jobs/${job.id}/checklist-state`, {
                                  method: "PATCH",
                                  credentials: "include",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ itemId: selectedChecklistItem.id, status: "completed" }),
                                });
                                if (!res.ok) throw new Error("Failed");
                                await qc.invalidateQueries({ queryKey: getGetJobQueryKey(job.id) });
                                await qc.invalidateQueries({ queryKey: getListJobsQueryKey() });
                              } catch {
                              }
                            }
                          }}
                          className="flex-1 py-2.5 text-white text-xs font-bold rounded-xl shadow-lg flex items-center justify-center gap-2 transition-colors bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20"
                        >
                          <CheckCircle2 size={14} /> Mark Complete
                        </button>
                      )}
                      {selectedChecklistItem.status !== "completed" &&
                        role === "user" &&
                        selectedChecklistItem.attachmentRequired &&
                        (checklistUploads[selectedChecklistItem.id] ?? 0) === 0 && (
                        <p className="basis-full text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                          Upload a checklist file above, then mark this item complete.
                        </p>
                      )}
                      {selectedChecklistItem.status === "completed" && role === "supervisor" && (
                        <button 
                          onClick={async () => {
                            const reason = prompt("Reason for rework?");
                            if (reason) {
                              const next = checklist.map((i) =>
                                i.id === selectedChecklistItem.id
                                  ? { ...i, status: "rework" as const, done: false, reworkReason: reason }
                                  : i
                              );
                              setChecklist(next);
                              setSelectedChecklistItem({ ...selectedChecklistItem, status: "rework" as const, done: false, reworkReason: reason });
                              persistLocalChecklist(next, checklistUploads);
                              if (job?.id) {
                                try {
                                  const res = await fetch(`/api/jobs/${job.id}/checklist-state`, {
                                    method: "PATCH",
                                    credentials: "include",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ itemId: selectedChecklistItem.id, status: "rework", reworkReason: reason, userId: job.assignee?.id ?? undefined }),
                                  });
                                  if (!res.ok) throw new Error("Failed");
                                  await qc.invalidateQueries({ queryKey: getGetJobQueryKey(job.id) });
                                  await qc.invalidateQueries({ queryKey: getListJobsQueryKey() });
                                } catch {
                                }
                              }
                            }
                          }}
                          className="flex-1 py-2.5 bg-purple-600 text-white text-xs font-bold rounded-xl shadow-lg shadow-purple-600/20 flex items-center justify-center gap-2 hover:bg-purple-700 transition-colors"
                        >
                          <RefreshCw size={14} /> Reject & Rework
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              ) : (
                <div className="bg-gray-50/50 rounded-2xl border-2 border-dashed border-gray-100 p-8 text-center flex flex-col items-center justify-center h-[400px]">
                  <div className="w-16 h-16 rounded-full bg-white shadow-sm flex items-center justify-center text-gray-300 mb-4">
                    <ListChecks size={32} />
                  </div>
                  <h4 className="font-bold text-gray-900">Task Details</h4>
                  <p className="text-xs text-gray-500 mt-1 max-w-[200px]">Select a task from the checklist to view its requirements and mark it complete.</p>
                </div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {tab === "files" && (() => {
          const q = fileSearch.toLowerCase();
          // Keep checklist-linked files on Checklist tab — hide them from Job Files
          const nonChecklist = attachments.filter((a) => a.checklistItemId == null);
          const inputFiles = nonChecklist.filter((a) => (a.uploadedBy?.role ?? "supervisor") !== "user");
          const outputFiles = nonChecklist.filter((a) => (a.uploadedBy?.role ?? "supervisor") === "user");
          const filteredInput = inputFiles.filter((a) => a.fileName.toLowerCase().includes(q));
          const filteredOutputServer = outputFiles.filter((a) => a.fileName.toLowerCase().includes(q));

          const canUploadInput = role === "super-admin" || role === "admin" || role === "supervisor";
          const canUploadOutput = role === "user" || role === "super-admin";

          return (
            <motion.div key="fl" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="space-y-6">
              {/* Search and Global Actions */}
              <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-white p-4 rounded-2xl border border-gray-100">
                <div className="relative w-full sm:w-96">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                  <input 
                    type="text" 
                    placeholder="Search files..." 
                    value={fileSearch}
                    onChange={(e) => setFileSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm !text-gray-900 !placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                  {canUploadOutput && (
                    <button onClick={() => handleUpload("output")} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-emerald-600/20 hover:bg-emerald-700">
                      <Upload size={14} /> Upload Completed
                    </button>
                  )}
                  {canUploadInput && (
                    <button onClick={() => handleUpload("input")} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-bold shadow-lg shadow-primary/20 hover:bg-primary/90">
                      <Upload size={14} /> Upload Job File
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6">
                {/* Job Files Section (Input) */}
                <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-gray-900">Job Files</h3>
                      <p className="text-[11px] text-gray-500 mt-0.5">Files uploaded when the job was assigned</p>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary uppercase">{filteredInput.length} Files</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-gray-50">
                          <th className="px-6 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider">File Name</th>
                          <th className="px-6 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Uploaded By</th>
                          <th className="px-6 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Upload Date</th>
                          <th className="px-6 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Type</th>
                          <th className="px-6 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {filteredInput.length === 0 ? (
                          <tr><td colSpan={5} className="px-6 py-10 text-center text-xs text-gray-400">No job files found</td></tr>
                        ) : filteredInput.map((a) => {
                          const t = detectType(a.fileName);
                          const who = a.uploadedBy?.name ?? "—";
                          const when = a.createdAt ? new Date(a.createdAt).toLocaleString() : "—";
                          return (
                          <tr key={a.id} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-lg ${FILE_ICON[t]} flex items-center justify-center`}><FileText size={14} /></div>
                                <span className="text-sm font-medium text-gray-900 truncate max-w-[200px]">{a.fileName}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-xs text-gray-600">{who}</td>
                            <td className="px-6 py-4 text-xs text-gray-600">{when}</td>
                            <td className="px-6 py-4 text-xs uppercase font-bold text-gray-400">{fileTypeLabel(a.fileName)}</td>
                            <td className="px-6 py-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button onClick={() => openAttachmentPreview(a)} className="p-2 text-gray-400 hover:text-primary hover:bg-primary/5 rounded-lg transition-colors" title="Preview"><Eye size={14} /></button>
                                <button onClick={() => downloadAttachment(a)} className="p-2 text-gray-400 hover:text-primary hover:bg-primary/5 rounded-lg transition-colors" title="Download"><Download size={14} /></button>
                              </div>
                            </td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Completed Files Section (Output) */}
                <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-100 bg-emerald-50/30 flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-gray-900">Completed Files</h3>
                      <p className="text-[11px] text-gray-500 mt-0.5">Deliverables uploaded after task completion</p>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 uppercase">{filteredOutputServer.length} Files</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-gray-50">
                          <th className="px-6 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider">File Name</th>
                          <th className="px-6 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Uploaded By</th>
                          <th className="px-6 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Completion Date</th>
                          <th className="px-6 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Status</th>
                          <th className="px-6 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {filteredOutputServer.length === 0 ? (
                          <tr><td colSpan={5} className="px-6 py-10 text-center text-xs text-gray-400">No completed files found</td></tr>
                        ) : (
                          <>
                          {filteredOutputServer.map((a) => {
                            const t = detectType(a.fileName);
                            const who = a.uploadedBy?.name ?? "—";
                            const when = a.createdAt ? new Date(a.createdAt).toLocaleString() : "—";
                            return (
                            <tr key={a.id} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-lg ${FILE_ICON[t]} flex items-center justify-center`}><FileText size={14} /></div>
                                <span className="text-sm font-medium text-gray-900 truncate max-w-[200px]">{a.fileName}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-xs text-gray-600">{who}</td>
                            <td className="px-6 py-4 text-xs text-gray-600">{when}</td>
                            <td className="px-6 py-4">
                              <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 border border-emerald-100">Submitted</span>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button onClick={() => openAttachmentPreview(a)} className="p-2 text-gray-400 hover:text-primary hover:bg-primary/5 rounded-lg transition-colors" title="Preview"><Eye size={14} /></button>
                                <button onClick={() => downloadAttachment(a)} className="p-2 text-gray-400 hover:text-primary hover:bg-primary/5 rounded-lg transition-colors" title="Download"><Download size={14} /></button>
                              </div>
                            </td>
                          </tr>
                            );
                          })}
                          </>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })()}

        {tab === "communication" && (() => {
          const fallbackChannelName = buildFallbackCliqChannelName(job, jobId);
          const channelName = cliqChannel?.channelName ?? fallbackChannelName;
          const cliqUrl = cliqChannel?.channelUrl ?? `${CLIQ_WEB_ROOT}/channels/${channelName}`;
          const openCliq = async () => {
            let url = cliqUrl;
            try {
              if (job?.id) {
                const res = await fetch(`/api/jobs/${job.id}/cliq/join`, { method: "POST", credentials: "include" });
                if (res.ok) {
                  const data = (await res.json()) as Partial<JobCliqChannelApi>;
                  if (typeof data.channelName === "string") {
                    const next = {
                      channelName: data.channelName,
                      channelUrl: typeof data.channelUrl === "string" ? data.channelUrl : null,
                      status: typeof data.status === "string" ? data.status : (cliqChannel?.status ?? "active"),
                    };
                    setCliqChannel(next);
                    url = next.channelUrl ?? `${CLIQ_WEB_ROOT}/channels/${next.channelName}`;
                  }
                }
              }
            } catch {
            }
            window.open(url, "_blank", "noopener,noreferrer");
          };
          const members = (jobMembers.length > 0 ? jobMembers : [
            job?.supervisor?.name ? { id: job.supervisor.id, name: job.supervisor.name, role: "supervisor" as Role } : null,
            job?.assignee?.name ? { id: job.assignee.id, name: job.assignee.name, role: "user" as Role } : null,
          ].filter(Boolean) as Array<{ id: string; name: string; role: Role }>)
            .map((m) => {
              const r =
                m.role === "supervisor" ? "Supervisor"
                : m.id === job?.assignee?.id ? "Assignee"
                : "Worker";
              return {
                name: m.name,
                avatar: initialsOf(m.name),
                role: r,
                status: "online" as const,
                hours: 0,
              };
            });
          return (
          <motion.div key="cm" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="space-y-5">
            {/* Channel hero card */}
            <div className="bg-gradient-to-br from-primary via-sky-700 to-indigo-900 rounded-2xl overflow-hidden text-white shadow-xl">
              <div className="p-6 flex flex-col md:flex-row md:items-center gap-5">
                <div className="w-16 h-16 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center shrink-0 border border-white/20">
                  <MessageCircle size={28} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-400/25 text-emerald-50 border border-emerald-300/40 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" /> Channel active
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/15 text-white/90">Zoho Cliq</span>
                  </div>
                  <h3 className="text-xl font-bold flex items-center gap-2 truncate">
                    <span className="opacity-70">#</span>{channelName}
                  </h3>
                  <p className="text-xs text-white/70 mt-1">Dedicated job channel · {members.length} members · Created when job was assigned</p>
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }} onClick={openCliq} className="flex items-center justify-center gap-2 px-5 py-2.5 bg-white text-primary rounded-xl font-bold text-sm shadow-lg">
                    <MessageCircle size={14} /> Open in Zoho Cliq
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M7 17L17 7M7 7h10v10"/></svg>
                  </motion.button>
                  <button onClick={() => navigator.clipboard?.writeText(cliqUrl)} className="text-[11px] text-white/80 hover:text-white text-center underline-offset-2 hover:underline">
                    Copy channel link
                  </button>
                </div>
              </div>
            </div>

            <div className="grid lg:grid-cols-3 gap-5">
              {/* LEFT — Channel info / how it works */}
              <div className="lg:col-span-2 space-y-5">
                {/* Members */}
                <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                  <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-gray-900 flex items-center gap-2"><Users size={16} className="text-primary" /> Channel Members</h3>
                      <p className="text-[11px] text-gray-500 mt-0.5">Auto-added when assigned to the job. They see all messages in Cliq.</p>
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-primary/10 text-primary">{members.length}</span>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {members.map((w, i) => (
                      <motion.div key={w.name} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }} className="flex items-center gap-3 px-5 py-3">
                        <div className="relative">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-sky-700 text-white text-xs font-bold flex items-center justify-center">{w.avatar}</div>
                          <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${w.status === "online" ? "bg-emerald-500" : "bg-amber-400"}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-gray-900 truncate">{w.name}</div>
                          <div className="text-[11px] text-gray-500">{w.role} · {w.status === "online" ? "Active in Cliq" : "Away"}</div>
                        </div>
                        {w.role === "Supervisor" && <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">Owner</span>}
                      </motion.div>
                    ))}
                  </div>
                </div>

                {/* Recent messages preview (read-only mirror) */}
                <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                  <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-gray-900 flex items-center gap-2"><MessageCircle size={16} className="text-primary" /> Recent Activity</h3>
                      <p className="text-[11px] text-gray-500 mt-0.5">Mirrored OPS history from the live Zoho Cliq job channel.</p>
                    </div>
                    <span className="text-[10px] font-medium text-gray-500 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live
                    </span>
                  </div>
                  <div className="p-4 space-y-3 max-h-[340px] overflow-y-auto bg-gray-50/40">
                    {messages.slice(-6).map((m, i) => (
                      <motion.div key={m.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className="flex gap-3 bg-white px-3 py-2.5 rounded-xl border border-gray-100">
                        <div className={`w-8 h-8 rounded-full text-white text-[11px] font-bold flex items-center justify-center shrink-0 ${m.isMe ? "bg-gradient-to-br from-primary to-sky-700" : "bg-gradient-to-br from-gray-700 to-gray-900"}`}>{m.avatar}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-xs font-bold text-gray-900">{m.user}</span>
                            <span className="text-[10px] text-gray-400">{m.time}</span>
                          </div>
                          <div className="text-sm text-gray-700 break-words">{m.text}</div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                  <div className="p-4 border-t border-gray-100 bg-blue-50/40 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-[11px] text-gray-600">
                      <Lock size={11} className="text-gray-400" />
                      <span>Replying happens inside Zoho Cliq — keeps message history, search and notifications in one place.</span>
                    </div>
                    <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }} onClick={openCliq} className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white rounded-lg text-[11px] font-bold shadow-md shadow-primary/30">
                      <Send size={11} /> Reply in Cliq
                    </motion.button>
                  </div>
                </div>
              </div>

              {/* RIGHT — How it works + actions */}
              <div className="space-y-5">
                <div className="bg-white rounded-2xl border border-gray-100 p-5">
                  <h3 className="font-bold text-gray-900 text-sm mb-3 flex items-center gap-2"><AlertTriangle size={14} className="text-primary" /> How job channels work</h3>
                  <ol className="space-y-3">
                    {[
                      "When a job is created, Vivid OPS auto-creates a dedicated private Cliq channel.",
                      "Only assigned workers + the supervisor are added as members automatically.",
                      "Conversation, files and @mentions live inside Zoho Cliq.",
                      "When the job is completed, the channel is archived (kept for audit).",
                    ].map((step, i) => (
                      <li key={i} className="flex gap-3 text-xs text-gray-700">
                        <span className="w-5 h-5 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                        <span className="leading-relaxed">{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>

                <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-2">
                  <h3 className="font-bold text-gray-900 text-sm mb-2">Quick actions</h3>
                  <button onClick={openCliq} className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border border-gray-200 hover:border-primary hover:bg-primary/5 text-xs font-semibold text-gray-700 hover:text-primary transition-colors group">
                    <span className="flex items-center gap-2"><MessageCircle size={13} /> Open channel</span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="opacity-50 group-hover:opacity-100"><path d="M7 17L17 7M7 7h10v10"/></svg>
                  </button>
                  <button onClick={openCliq} className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border border-gray-200 hover:border-primary hover:bg-primary/5 text-xs font-semibold text-gray-700 hover:text-primary transition-colors group">
                    <span className="flex items-center gap-2"><Users size={13} /> Manage members</span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="opacity-50 group-hover:opacity-100"><path d="M7 17L17 7M7 7h10v10"/></svg>
                  </button>
                  <button onClick={() => navigator.clipboard?.writeText(cliqUrl)} className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border border-gray-200 hover:border-primary hover:bg-primary/5 text-xs font-semibold text-gray-700 hover:text-primary transition-colors">
                    <span className="flex items-center gap-2"><FileText size={13} /> Copy invite link</span>
                  </button>
                </div>

                {/* Quick-send fallback inline (optional) */}
                <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl border border-amber-200 p-4">
                  <h4 className="text-xs font-bold text-amber-900 mb-1">Quick message</h4>
                  <p className="text-[11px] text-amber-800/80 mb-3">Send a one-off note to the channel without leaving Vivid OPS.</p>
                  <form onSubmit={(e) => { e.preventDefault(); sendMessage(); }} className="space-y-2">
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder="Type a quick update..."
                      rows={2}
                      className="w-full bg-white rounded-xl px-3 py-2 text-xs !text-gray-900 !placeholder:text-gray-400 border border-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-300 resize-none"
                    />
                    <motion.button type="submit" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-amber-500 text-white rounded-xl text-xs font-bold hover:bg-amber-600">
                      <Send size={11} /> Post to channel
                    </motion.button>
                  </form>
                </div>
              </div>
            </div>
          </motion.div>
          );
        })()}

        {tab === "logs" && (
          <motion.div key="lg" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-900">Timer Logs</h3>
                <p className="text-xs text-gray-500 mt-0.5">All time tracked on this job</p>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-gray-900 font-mono">{formatHoursMinutes(totalLoggedSeconds)}</div>
                <div className="text-[10px] text-gray-500 uppercase tracking-wide">Total</div>
              </div>
            </div>
            {jobLogsP.pageItems.map((l, i) => (
              <motion.div
                key={l.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                whileHover={{ backgroundColor: "rgb(249,250,251)" }}
                className="flex items-center gap-4 px-5 py-3.5 border-b border-gray-50 last:border-0"
              >
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-sky-700 text-white text-xs font-bold flex items-center justify-center">
                  {l.user.split(" ").map((s) => s[0]).join("")}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-gray-900">{l.user}</div>
                  <div className="text-xs text-gray-500">{l.task}</div>
                </div>
                <div className="text-xs text-gray-500 hidden sm:block">{l.date}</div>
                <div className="font-mono text-sm font-bold text-gray-900 tabular-nums w-20 text-right">{l.duration}</div>
              </motion.div>
            ))}
            <Pagination page={jobLogsP.page} totalPages={jobLogsP.totalPages} total={jobLogsP.total} pageSize={jobLogsP.pageSize} onChange={jobLogsP.setPage} label="entries" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Activity check-in popup */}
      <AnimatePresence>
        {showActivityPing && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="fixed bottom-6 right-6 bg-white border border-gray-200 rounded-2xl shadow-2xl p-5 max-w-sm z-50"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                <Clock size={18} />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <div className="font-bold text-gray-900 text-sm">Still working?</div>
                  <span className="text-[10px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">Auto-stop in {autoStopCountdown}s</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">We'll auto-stop your timer and save the log if you don't respond.</p>
                <div className="h-1 bg-gray-100 rounded-full overflow-hidden mt-2">
                  <motion.div
                    key={autoStopCountdown}
                    className="h-full bg-red-500"
                    initial={{ width: "100%" }}
                    animate={{ width: `${(autoStopCountdown / AUTO_STOP_S) * 100}%` }}
                    transition={{ duration: 1, ease: "linear" }}
                  />
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => setShowActivityPing(false)}
                    className="flex-1 py-1.5 bg-primary text-white rounded-lg text-xs font-bold hover:bg-primary/90"
                  >
                    Yes, continue
                  </button>
                  <button
                    onClick={() => {
                      void stopAndSaveTimeLog("Manually stopped");
                    }}
                    className="flex-1 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs font-bold hover:bg-gray-200"
                  >
                    Stop & save
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Rework modal */}
      <AnimatePresence>
        {reworkOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setReworkOpen(false)}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl p-6 max-w-md w-full"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                    <AlertTriangle size={18} />
                  </div>
                  <h3 className="text-lg font-bold text-gray-900">Mark for Rework</h3>
                </div>
                <button onClick={() => setReworkOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
              </div>
              <p className="text-sm text-gray-500 mb-4">The assigned worker will be notified to redo the work.</p>
              <label className="text-xs font-semibold text-gray-700 mb-1.5 block">Reason</label>
              <textarea
                value={reworkReason}
                onChange={(e) => setReworkReason(e.target.value)}
                rows={4}
                placeholder="What needs to be redone?"
                className="w-full bg-white border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm !text-gray-900 !placeholder:text-gray-400 focus:outline-none focus:border-primary resize-none mb-4"
              />
              <div className="flex gap-2">
                <button onClick={() => setReworkOpen(false)} className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-200">Cancel</button>
                <button
                  onClick={async () => {
                    if (!job?.id) return;
                    try {
                      const res = await fetch(`/api/jobs/${job.id}/review`, {
                        method: "POST",
                        credentials: "include",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "rework", reason: reworkReason }),
                      });
                      if (!res.ok) {
                        const data = await res.json().catch(() => ({}));
                        throw new Error((data as any).error || "Failed to mark for rework");
                      }
                      await qc.invalidateQueries({ queryKey: getGetJobQueryKey(job.id) });
                      await qc.invalidateQueries({ queryKey: getListJobsQueryKey() });
                      setReworkReason("");
                      setReworkOpen(false);
                    } catch (err) {
                      console.error(err instanceof Error ? err.message : "Failed to mark for rework");
                    }
                  }}
                  className="flex-1 py-2.5 bg-amber-500 text-white rounded-xl text-sm font-semibold hover:bg-amber-600 flex items-center justify-center gap-2"
                >
                  <RefreshCw size={14} /> Submit
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
        {approveOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setApproveOpen(false)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center"><CheckCircle2 size={18} /></div>
                  <h3 className="text-lg font-bold text-gray-900">
                    {role === "supervisor" ? "Approve for Admin Review" : "Complete Job"}
                  </h3>
                </div>
                <button onClick={() => setApproveOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
              </div>
              {jobApproved ? (
                <div className="py-6 text-center">
                  <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-3"><CheckCircle2 size={28} /></div>
                  <div className="text-base font-bold text-gray-900">
                    {role === "supervisor" ? "Sent to admin for completion" : "Job marked complete"}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {role === "supervisor" ? "Admins have been notified." : "The worker has been notified."}
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-sm text-gray-600 mb-4">
                    {role === "supervisor"
                      ? "Confirm the deliverables look good. The job will move to admin/super-admin for final completion."
                      : "Confirm that the deliverables, checklist and time logs all look good. The job will be marked Completed and the worker notified."}
                  </p>
                  <div className="space-y-2 mb-5 text-xs">
                    <div className="flex items-center gap-2 text-gray-700"><CheckCircle2 size={14} className="text-emerald-500" /> Checklist reviewed ({checklist.filter((c) => c.status === "completed").length}/{checklist.length} done)</div>
                    <div className="flex items-center gap-2 text-gray-700"><CheckCircle2 size={14} className="text-emerald-500" /> {attachments.filter((a) => (a.uploadedBy?.role ?? "supervisor") === "user").length} completed file(s) submitted</div>
                    <div className="flex items-center gap-2 text-gray-700"><CheckCircle2 size={14} className="text-emerald-500" /> Time logs verified</div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setApproveOpen(false)} className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-200">Cancel</button>
                    <button
                      onClick={async () => {
                        if (job?.id) {
                          try {
                            const action = role === "supervisor" ? "supervisor_approve" : "admin_complete";
                            const res = await fetch(`/api/jobs/${job.id}/review`, {
                              method: "POST",
                              credentials: "include",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ action }),
                            });
                            if (!res.ok) {
                              const data = await res.json().catch(() => ({}));
                              throw new Error((data as any).error || "Failed to approve job");
                            }
                            await qc.invalidateQueries({ queryKey: getGetJobQueryKey(job.id) });
                            await qc.invalidateQueries({ queryKey: getListJobsQueryKey() });
                            setJobApproved(true);
                            setTimeout(() => { setApproveOpen(false); setJobApproved(false); }, 1400);
                          } catch (err) {
                            const msg = err instanceof Error ? err.message : "Failed to approve job";
                            console.error(msg);
                          }
                        }
                      }}
                      className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 flex items-center justify-center gap-2"
                    >
                      <CheckCircle2 size={14} /> {role === "supervisor" ? "Approve" : "Complete"}
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <Dialog
        open={taskDialogOpen}
        onOpenChange={(open) => {
          if (open) setTaskDialogOpen(true);
          else resolveTaskDialog(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Start timer</DialogTitle>
            <DialogDescription>
              Enter the task you are starting.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <input
              value={taskDialogValue}
              onChange={(e) => {
                setTaskDialogValue(e.target.value);
                setTaskDialogError(null);
              }}
              placeholder="e.g. Checklist + photos"
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary"
              autoFocus
            />
            {taskDialogError && (
              <div className="text-xs text-red-600">{taskDialogError}</div>
            )}
          </div>
          <DialogFooter>
            <button
              type="button"
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              onClick={() => resolveTaskDialog(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90"
              onClick={() => {
                const t = taskDialogValue.trim();
                if (!t) {
                  setTaskDialogError("Task is required");
                  return;
                }
                resolveTaskDialog(t);
              }}
            >
              Start
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!previewAttachment} onOpenChange={(open) => !open && setPreviewAttachment(null)}>
        <DialogContent className="max-w-5xl w-[95vw]">
          <DialogHeader>
            <DialogTitle>{previewAttachment?.fileName ?? "File preview"}</DialogTitle>
            <DialogDescription>Preview opens inside Vivid OPS. Use Download to save the file.</DialogDescription>
          </DialogHeader>
          {previewAttachment && job?.id && (
            <div className="max-h-[75vh] overflow-auto rounded-xl border border-gray-100 bg-gray-50">
              {(() => {
                const ext = attachmentExtension(previewAttachment.fileName);
                const url = attachmentViewUrl(previewAttachment.id, false);
                if (
                  ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext) ||
                  (previewAttachment.fileType || "").startsWith("image/")
                ) {
                  return (
                    <img
                      src={url}
                      alt={previewAttachment.fileName}
                      className="max-w-full mx-auto block"
                    />
                  );
                }
                if (ext === "pdf" || previewAttachment.fileType === "application/pdf") {
                  return (
                    <iframe
                      src={url}
                      title={previewAttachment.fileName}
                      className="w-full h-[75vh] bg-white"
                    />
                  );
                }
                if (ext === "txt" || (previewAttachment.fileType || "").startsWith("text/")) {
                  return (
                    <iframe
                      src={url}
                      title={previewAttachment.fileName}
                      className="w-full h-[75vh] bg-white"
                    />
                  );
                }
                return (
                  <div className="p-8 text-center text-sm text-gray-500">
                    Preview is not available for this file type.
                  </div>
                );
              })()}
            </div>
          )}
          <DialogFooter>
            {previewAttachment && (
              <button
                type="button"
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90"
                onClick={() => previewAttachment && downloadAttachment(previewAttachment)}
              >
                Download
              </button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
