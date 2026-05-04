import { useState, useEffect, useRef } from "react";
import { Link, useRoute } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, MapPin, Calendar, User, Briefcase, CheckCircle2, Circle,
  Play, Pause, Square, Upload, FileText, Download, MessageCircle, Send,
  RefreshCw, AlertTriangle, Clock, Users, X, Edit2,
  Inbox, FolderOpen, MessageSquare, History, ChevronDown, Lock,
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import type { Role } from "@/lib/roles";

interface Props { role?: Role }

const JOB = {
  number: "JOB-2148",
  title: "Server Maintenance",
  client: "BrightSpark Industries",
  address: "120 Park Avenue, Sydney NSW 2000",
  startDate: "Apr 18, 2026",
  dueDate: "Apr 20, 2026, 5:00 PM",
  completedDate: "—",
  status: "In Progress",
  priority: "High",
  description: "Quarterly server maintenance including firmware updates, hardware inspection, and performance benchmarking across all production server racks.",
};

const WORKERS = [
  { name: "Jordan Reed", avatar: "JR", role: "Lead", status: "online", hours: 6.5 },
  { name: "Riley Adams", avatar: "RA", role: "Tech", status: "online", hours: 4.2 },
  { name: "Olivia Carter", avatar: "OC", role: "Tech", status: "away", hours: 3.8 },
];

interface ChecklistItem { id: number; text: string; done: boolean }

const INITIAL_CHECKLIST: ChecklistItem[] = [
  { id: 1, text: "Power down server rack A", done: true },
  { id: 2, text: "Verify backup completion", done: true },
  { id: 3, text: "Apply firmware updates", done: true },
  { id: 4, text: "Run hardware diagnostics", done: false },
  { id: 5, text: "Replace failed drives if needed", done: false },
  { id: 6, text: "Performance benchmarks", done: false },
  { id: 7, text: "Power on and verify uptime", done: false },
  { id: 8, text: "Document changes in log", done: false },
];

interface FileItem { id: number; name: string; size: string; type: "doc" | "image" | "pdf"; uploadedBy: string; uploadedAt: string; tag: "input" | "output"; version?: number; group?: string }

const INITIAL_FILES: FileItem[] = [
  // INPUT — provided by supervisor at job creation
  { id: 1, name: "site_diagram_v2.pdf", size: "2.4 MB", type: "pdf", uploadedBy: "Sam Carter", uploadedAt: "Yesterday", tag: "input" },
  { id: 2, name: "client_brief.docx", size: "186 KB", type: "doc", uploadedBy: "Sam Carter", uploadedAt: "Yesterday", tag: "input" },
  { id: 3, name: "equipment_manual.pdf", size: "5.8 MB", type: "pdf", uploadedBy: "Sam Carter", uploadedAt: "2 days ago", tag: "input" },
  // OUTPUT — uploaded by user, with version history
  { id: 4, name: "diagnostics_report.docx", size: "298 KB", type: "doc", uploadedBy: "Jordan Reed", uploadedAt: "Today, 10:14am", tag: "output", version: 1, group: "diagnostics_report" },
  { id: 5, name: "diagnostics_report.docx", size: "318 KB", type: "doc", uploadedBy: "Jordan Reed", uploadedAt: "Today, 11:02am", tag: "output", version: 2, group: "diagnostics_report" },
  { id: 6, name: "rack_photo_after.jpg", size: "1.4 MB", type: "image", uploadedBy: "Jordan Reed", uploadedAt: "Today, 11:08am", tag: "output", version: 1, group: "rack_photo_after" },
];

interface FileNote { id: number; author: string; avatar: string; text: string; time: string; kind: "rework" | "comment" }

const INITIAL_NOTES: FileNote[] = [
  { id: 1, author: "Sam Carter", avatar: "SC", kind: "rework", text: "diagnostics_report.docx v1 — please add the firmware version table at the bottom and re-upload.", time: "Today, 10:42am" },
  { id: 2, author: "Jordan Reed", avatar: "JR", kind: "comment", text: "Re-uploaded as v2 with the firmware table added.", time: "Today, 11:02am" },
];

const INITIAL_MESSAGES = [
  { id: 1, user: "Sam Carter", avatar: "SC", text: "Make sure to check the cooling fans on rack B — they were running hot last week.", time: "9:02am", isMe: false },
  { id: 2, user: "Jordan Reed", avatar: "JR", text: "Will do. Just powered down rack A, starting diagnostics now.", time: "9:14am", isMe: true },
  { id: 3, user: "Riley Adams", avatar: "RA", text: "I've got the spare drives ready if we need them.", time: "10:48am", isMe: false },
];

const INITIAL_TIMER_LOGS = [
  { id: 1, user: "Jordan Reed", duration: "2:30:15", task: "Power down + backup", date: "Today, 9:00am" },
  { id: 2, user: "Riley Adams", duration: "1:45:00", task: "Drive replacement prep", date: "Today, 10:30am" },
  { id: 3, user: "Jordan Reed", duration: "1:18:42", task: "Firmware updates", date: "Today, 11:30am" },
];

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

function formatTime(s: number) {
  return `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export default function JobDetail({ role = "user" }: Props) {
  const routePath = role === "supervisor" ? "/supervisor/jobs/:id"
    : role === "admin" ? "/admin/jobs/:id"
    : role === "super-admin" ? "/super-admin/jobs/:id"
    : "/user/jobs/:id";
  const [, params] = useRoute(routePath);
  const jobId = params?.id ?? JOB.number;

  const [tab, setTab] = useState<TabId>(role === "supervisor" ? "overview" : "checklist");
  const [checklist, setChecklist] = useState(INITIAL_CHECKLIST);
  const [files, setFiles] = useState(INITIAL_FILES);
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [draft, setDraft] = useState("");
  const [running, setRunning] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [reworkOpen, setReworkOpen] = useState(false);
  const [reworkReason, setReworkReason] = useState("");
  const [approveOpen, setApproveOpen] = useState(false);
  const [jobApproved, setJobApproved] = useState(false);
  const [showActivityPing, setShowActivityPing] = useState(false);
  const [autoStopCountdown, setAutoStopCountdown] = useState(30);
  const [savedLogs, setSavedLogs] = useState(INITIAL_TIMER_LOGS);
  const [fileSubTab, setFileSubTab] = useState<"input" | "output" | "notes">("input");
  const [notes, setNotes] = useState(INITIAL_NOTES);
  const [noteDraft, setNoteDraft] = useState("");
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const intervalRef = useRef<number | null>(null);
  const pingTimerRef = useRef<number | null>(null);
  const autoStopRef = useRef<number | null>(null);
  // Demo timing: 30s instead of 1hr; auto-stop after 30s of no response (real: 5 min)
  const PING_INTERVAL_S = 30;
  const AUTO_STOP_S = 30;

  // Trigger hourly check-in: every PING_INTERVAL_S of running time, show popup
  useEffect(() => {
    if (!running) {
      if (pingTimerRef.current) clearTimeout(pingTimerRef.current);
      return;
    }
    pingTimerRef.current = window.setTimeout(() => {
      setShowActivityPing(true);
      setAutoStopCountdown(AUTO_STOP_S);
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
          // Auto-stop and save log
          setRunning(false);
          setShowActivityPing(false);
          setSavedLogs((logs) => [{
            id: Date.now(),
            user: "Jordan Reed",
            duration: formatTime(seconds),
            task: "Auto-stopped (no response)",
            date: "Just now",
          }, ...logs]);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => { if (autoStopRef.current) clearInterval(autoStopRef.current); };
  }, [showActivityPing, seconds]);

  useEffect(() => {
    if (running) intervalRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    else if (intervalRef.current) clearInterval(intervalRef.current);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running]);

  const completedCount = checklist.filter((c) => c.done).length;
  const progress = Math.round((completedCount / checklist.length) * 100);

  const toggleCheck = (id: number) => setChecklist(checklist.map((c) => c.id === id ? { ...c, done: !c.done } : c));
  const sendMessage = () => {
    if (!draft.trim()) return;
    setMessages([...messages, { id: Date.now(), user: "You", avatar: "JR", text: draft, time: "now", isMe: true }]);
    setDraft("");
  };
  const inputPickerRef = useRef<HTMLInputElement>(null);
  const outputPickerRef = useRef<HTMLInputElement>(null);
  const reuploadPickerRef = useRef<HTMLInputElement>(null);
  const reuploadGroupRef = useRef<string | null>(null);
  const formatSize = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  const detectType = (name: string): FileItem["type"] => {
    const ext = name.split(".").pop()?.toLowerCase() ?? "";
    if (["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(ext)) return "image";
    if (["doc", "docx", "xls", "xlsx", "csv", "txt"].includes(ext)) return "doc";
    return "pdf";
  };
  const handleUpload = (tag: FileItem["tag"]) => {
    if (tag === "input") inputPickerRef.current?.click();
    else outputPickerRef.current?.click();
  };
  const onPickerChange = (tag: FileItem["tag"]) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (picked.length === 0) return;
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

  return (
    <DashboardLayout title="Job Details" role={role}>
      {/* Back link */}
      <Link href={role === "supervisor" ? "/supervisor/jobs" : "/user/jobs"}>
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
              <span className="text-xs font-bold text-primary tracking-wider">{jobId}</span>
              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20`}>{JOB.status}</span>
              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200`}>{JOB.priority} Priority</span>
            </div>
            <h2 className="text-2xl font-bold text-gray-900">{JOB.title}</h2>
            <div className="text-sm text-gray-500 mt-1">{JOB.client}</div>
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
            {(role === "supervisor" || role === "admin" || role === "super-admin") && (
              <>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setReworkOpen(true)}
                  className="flex items-center gap-2 px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-xl text-xs font-semibold"
                >
                  <RefreshCw size={12} /> Mark for Rework
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setApproveOpen(true)}
                  className="flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-md shadow-emerald-600/30"
                >
                  <CheckCircle2 size={12} /> Approve &amp; Complete
                </motion.button>
              </>
            )}
            {role === "user" && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => { setFileSubTab("output"); setTab("files"); }}
                className="flex items-center gap-2 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-semibold"
                title="Submit your completed deliverables for supervisor review"
              >
                <Upload size={12} /> Submit for Review
              </motion.button>
            )}
          </div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4 pt-4 border-t border-gray-100">
          <div className="flex items-start gap-2.5"><MapPin size={14} className="text-gray-400 mt-0.5" />
            <div><div className="text-[10px] text-gray-500 uppercase font-semibold">Location</div><div className="text-sm text-gray-900 font-medium">{JOB.address}</div></div>
          </div>
          <div className="flex items-start gap-2.5"><Calendar size={14} className="text-gray-400 mt-0.5" />
            <div><div className="text-[10px] text-gray-500 uppercase font-semibold">Date Created</div><div className="text-sm text-gray-900 font-medium">{JOB.startDate}</div></div>
          </div>
          <div className="flex items-start gap-2.5"><Clock size={14} className="text-amber-500 mt-0.5" />
            <div><div className="text-[10px] text-gray-500 uppercase font-semibold">Est. Completion</div><div className="text-sm text-gray-900 font-medium">{JOB.dueDate}</div></div>
          </div>
          <div className="flex items-start gap-2.5"><CheckCircle2 size={14} className={`mt-0.5 ${JOB.completedDate === "—" ? "text-gray-300" : "text-emerald-500"}`} />
            <div><div className="text-[10px] text-gray-500 uppercase font-semibold">Date Completed</div><div className={`text-sm font-medium ${JOB.completedDate === "—" ? "text-gray-400 italic" : "text-gray-900"}`}>{JOB.completedDate === "—" ? "Not yet completed" : JOB.completedDate}</div></div>
          </div>
          <div className="flex items-start gap-2.5"><User size={14} className="text-gray-400 mt-0.5" />
            <div><div className="text-[10px] text-gray-500 uppercase font-semibold">Lead</div><div className="text-sm text-gray-900 font-medium">Jordan Reed</div></div>
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
              <div className="font-mono text-4xl md:text-5xl font-bold text-white tabular-nums">{formatTime(seconds)}</div>
            </div>
            <div className="flex gap-2">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setRunning(!running)}
                className="flex items-center gap-2 px-5 py-2.5 bg-white text-primary rounded-xl text-sm font-bold shadow-lg"
              >
                {running ? <><Pause size={14} /> Pause</> : <><Play size={14} fill="currentColor" /> Start Work</>}
              </motion.button>
              {seconds > 0 && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => { setRunning(false); setSeconds(0); }}
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
              <p className="text-sm text-gray-600 leading-relaxed">{JOB.description}</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2"><Users size={16} className="text-primary" /> Assigned Workers</h3>
              {WORKERS.map((w, i) => (
                <motion.div key={w.name} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50">
                  <div className="relative">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-sky-700 text-white text-xs font-bold flex items-center justify-center">{w.avatar}</div>
                    <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full ring-2 ring-white ${w.status === "online" ? "bg-emerald-400" : "bg-amber-400"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-gray-900 truncate">{w.name}</div>
                    <div className="text-[11px] text-gray-500">{w.role} · {w.hours}h logged</div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {tab === "checklist" && (
          <motion.div key="cl" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-900">Task Checklist</h3>
                <p className="text-xs text-gray-500 mt-0.5">{completedCount} of {checklist.length} tasks completed</p>
              </div>
              <div className="text-2xl font-bold text-primary">{progress}%</div>
            </div>
            <div>
              {checklist.map((c, i) => (
                <motion.button
                  key={c.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                  whileHover={{ backgroundColor: "rgb(249,250,251)" }}
                  onClick={() => toggleCheck(c.id)}
                  className="w-full flex items-center gap-3 px-5 py-3.5 border-b border-gray-50 last:border-0 text-left group"
                >
                  <motion.div whileTap={{ scale: 0.85 }} className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${c.done ? "bg-primary border-primary" : "border-gray-300 group-hover:border-primary"}`}>
                    <AnimatePresence>
                      {c.done && (
                        <motion.svg initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <path d="M2 6l3 3 5-6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </motion.svg>
                      )}
                    </AnimatePresence>
                  </motion.div>
                  <span className={`text-sm flex-1 transition-colors ${c.done ? "text-gray-400 line-through" : "text-gray-900"}`}>{c.text}</span>
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}

        {tab === "files" && (() => {
          const inputFiles = files.filter((f) => f.tag === "input");
          const outputFiles = files.filter((f) => f.tag === "output");
          // Group output files by `group` for version history
          const groups = Array.from(new Set(outputFiles.map((f) => f.group ?? `single-${f.id}`)));
          const canUploadInput = role === "super-admin" || role === "admin" || role === "supervisor";
          const canUploadOutput = role === "user" || role === "super-admin";
          const canRework = role === "supervisor" || role === "admin" || role === "super-admin";

          const SUB_TABS = [
            { id: "input" as const, label: "Files Provided", icon: Inbox, count: inputFiles.length, color: "text-primary" },
            { id: "output" as const, label: role === "user" ? "Your Uploads" : "Completed Files", icon: FolderOpen, count: outputFiles.length, color: "text-emerald-600" },
            { id: "notes" as const, label: "Comments / Notes", icon: MessageSquare, count: notes.length, color: "text-amber-600" },
          ];

          return (
          <motion.div key="fl" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}>
            {/* Hidden file inputs — open native OS picker */}
            <input ref={inputPickerRef} type="file" multiple className="hidden" onChange={onPickerChange("input")} accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.svg,.zip,.dwg,.dxf" />
            <input ref={outputPickerRef} type="file" multiple className="hidden" onChange={onPickerChange("output")} accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.svg,.zip,.dwg,.dxf" />
            <input ref={reuploadPickerRef} type="file" className="hidden" onChange={onReuploadChange} accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.svg,.zip,.dwg,.dxf" />

            {/* Sub-tab pills */}
            <div className="bg-white rounded-2xl border border-gray-100 p-2 mb-5 inline-flex gap-1 relative">
              {SUB_TABS.map((s) => {
                const active = fileSubTab === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => setFileSubTab(s.id)}
                    className={`relative flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-colors ${active ? "text-white" : "text-gray-600 hover:text-gray-900"}`}
                  >
                    {active && (
                      <motion.div layoutId="fileSubTabPill" className="absolute inset-0 bg-gradient-to-r from-primary to-sky-700 rounded-xl pointer-events-none" transition={{ type: "spring", stiffness: 300, damping: 28 }} />
                    )}
                    <span className="relative flex items-center gap-2">
                      <s.icon size={14} /> {s.label}
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${active ? "bg-white/25" : "bg-gray-100 text-gray-600"}`}>{s.count}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            {/* INPUT FILES — provided by admin/supervisor at job creation */}
            {fileSubTab === "input" && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <div className="p-5 border-b border-gray-100 bg-blue-50/40 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary text-white flex items-center justify-center"><Inbox size={18} /></div>
                    <div>
                      <h3 className="font-bold text-gray-900 flex items-center gap-2">Files Provided <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">Input</span></h3>
                      <p className="text-[11px] text-gray-500 mt-0.5">Reference material from supervisor / admin — design briefs, client docs, equipment manuals.</p>
                    </div>
                  </div>
                  {canUploadInput ? (
                    <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }} onClick={() => handleUpload("input")} className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-primary hover:bg-primary/90 text-white shadow-md shadow-primary/30 shrink-0">
                      <Upload size={12} /> Upload Input
                    </motion.button>
                  ) : (
                    <span className="flex items-center gap-1.5 text-[11px] text-gray-500 font-medium px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-200 shrink-0"><Lock size={11} /> Read-only</span>
                  )}
                </div>
                <AnimatePresence>
                  {inputFiles.length === 0 && (
                    <div className="px-5 py-10 text-center text-xs text-gray-400">No input files yet.</div>
                  )}
                  {inputFiles.map((f, i) => (
                    <motion.div key={f.id} layout initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ delay: i * 0.04 }} whileHover={{ backgroundColor: "rgb(249,250,251)" }} className="flex items-center gap-4 px-5 py-3.5 border-b border-gray-50 last:border-0 group">
                      <div className={`w-10 h-10 rounded-xl ${FILE_ICON[f.type]} flex items-center justify-center shrink-0`}><FileText size={18} /></div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-gray-900 truncate">{f.name}</div>
                        <div className="text-[11px] text-gray-500 mt-0.5">{f.size} · {f.uploadedBy} · {f.uploadedAt}</div>
                      </div>
                      <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-primary bg-primary/5 hover:bg-primary/10 border border-primary/20">
                        <Download size={12} /> Download
                      </motion.button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </motion.div>
            )}

            {/* OUTPUT FILES — uploaded by user, grouped by version history */}
            {fileSubTab === "output" && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <div className="p-5 border-b border-gray-100 bg-emerald-50/40 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center"><FolderOpen size={18} /></div>
                    <div>
                      <h3 className="font-bold text-gray-900 flex items-center gap-2">{role === "user" ? "Your Uploads" : "Completed Files"} <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Output</span></h3>
                      <p className="text-[11px] text-gray-500 mt-0.5">Final deliverables uploaded by the field user. Each file keeps a full version history for rework tracking.</p>
                    </div>
                  </div>
                  {canUploadOutput && (
                    <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }} onClick={() => handleUpload("output")} className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/30 shrink-0">
                      <Upload size={12} /> Upload Completed
                    </motion.button>
                  )}
                </div>
                <AnimatePresence>
                  {groups.length === 0 && (
                    <div className="px-5 py-10 text-center text-xs text-gray-400">No completed files uploaded yet — submit them when the job is done.</div>
                  )}
                  {groups.map((g, gi) => {
                    const versions = outputFiles.filter((f) => (f.group ?? `single-${f.id}`) === g).sort((a, b) => (b.version ?? 1) - (a.version ?? 1));
                    const latest = versions[0];
                    const isOpen = expandedGroup === g;
                    return (
                      <motion.div key={g} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: gi * 0.05 }} className="border-b border-gray-50 last:border-0">
                        <div className="flex items-center gap-4 px-5 py-3.5 group hover:bg-gray-50/50">
                          <div className={`w-10 h-10 rounded-xl ${FILE_ICON[latest.type]} flex items-center justify-center shrink-0`}><FileText size={18} /></div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-gray-900 truncate flex items-center gap-2">
                              {latest.name}
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">v{latest.version ?? 1}</span>
                            </div>
                            <div className="text-[11px] text-gray-500 mt-0.5">{latest.size} · {latest.uploadedBy} · {latest.uploadedAt} · {versions.length} version{versions.length > 1 ? "s" : ""}</div>
                          </div>
                          {versions.length > 1 && (
                            <button onClick={() => setExpandedGroup(isOpen ? null : g)} className="flex items-center gap-1 text-[11px] text-gray-600 hover:text-primary font-semibold px-2.5 py-1.5 rounded-lg hover:bg-primary/5">
                              <History size={12} /> History
                              <motion.span animate={{ rotate: isOpen ? 180 : 0 }}><ChevronDown size={12} /></motion.span>
                            </button>
                          )}
                          {canUploadOutput && (
                            <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} onClick={() => reuploadVersion(g)} className="text-[10px] font-bold uppercase px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200" title="Upload a new version">
                              + Re-upload
                            </motion.button>
                          )}
                          <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200">
                            <Download size={12} /> Download
                          </motion.button>
                        </div>
                        <AnimatePresence>
                          {isOpen && versions.length > 1 && (
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden bg-gray-50/60">
                              <div className="px-5 py-3 border-t border-gray-100">
                                <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2">Version history</div>
                                {versions.slice(1).map((v) => (
                                  <div key={v.id} className="flex items-center gap-3 py-2 text-xs">
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-200 text-gray-700">v{v.version}</span>
                                    <span className="text-gray-700">{v.size}</span>
                                    <span className="text-gray-500">· {v.uploadedBy} · {v.uploadedAt}</span>
                                    <button className="ml-auto flex items-center gap-1 text-primary hover:underline"><Download size={11} /> Download</button>
                                  </div>
                                ))}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </motion.div>
            )}

            {/* COMMENTS / NOTES — for rework feedback between supervisor + user */}
            {fileSubTab === "notes" && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <div className="p-5 border-b border-gray-100 bg-amber-50/40 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center"><MessageSquare size={18} /></div>
                  <div>
                    <h3 className="font-bold text-gray-900">Comments / Notes</h3>
                    <p className="text-[11px] text-gray-500 mt-0.5">Rework feedback and review notes on the deliverable files.</p>
                  </div>
                </div>
                <div className="p-5 space-y-3 max-h-[440px] overflow-y-auto">
                  {notes.length === 0 && <div className="text-center text-xs text-gray-400 py-10">No notes yet.</div>}
                  {notes.map((n, i) => (
                    <motion.div key={n.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className={`flex gap-3 p-3 rounded-xl border ${n.kind === "rework" ? "bg-amber-50/60 border-amber-200" : "bg-gray-50 border-gray-200"}`}>
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-700 to-gray-900 text-white text-[11px] font-bold flex items-center justify-center shrink-0">{n.avatar}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs font-bold text-gray-900">{n.author}</span>
                          {n.kind === "rework" && <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-200 text-amber-800">Rework</span>}
                          <span className="text-[10px] text-gray-500">· {n.time}</span>
                        </div>
                        <div className="text-sm text-gray-700">{n.text}</div>
                      </div>
                    </motion.div>
                  ))}
                </div>
                <div className="p-4 border-t border-gray-100 bg-gray-50/60">
                  <div className="flex gap-2">
                    <input
                      value={noteDraft}
                      onChange={(e) => setNoteDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && noteDraft.trim()) {
                          setNotes([...notes, { id: Date.now(), author: role === "user" ? "Jordan Reed" : "Sam Carter", avatar: role === "user" ? "JR" : "SC", text: noteDraft, time: "Just now", kind: canRework ? "rework" : "comment" }]);
                          setNoteDraft("");
                        }
                      }}
                      placeholder={canRework ? "Add a rework comment for the user..." : "Reply to the supervisor..."}
                      className="flex-1 px-4 py-2.5 bg-white border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:border-primary"
                    />
                    <motion.button
                      whileHover={{ scale: 1.04 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => {
                        if (!noteDraft.trim()) return;
                        setNotes([...notes, { id: Date.now(), author: role === "user" ? "Jordan Reed" : "Sam Carter", avatar: role === "user" ? "JR" : "SC", text: noteDraft, time: "Just now", kind: canRework ? "rework" : "comment" }]);
                        setNoteDraft("");
                      }}
                      className="px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold flex items-center gap-2 shadow-md shadow-primary/30"
                    >
                      <Send size={14} /> Post
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Permissions footer */}
            <div className="mt-4 px-4 py-3 bg-white rounded-xl border border-gray-100 flex items-center gap-2 text-[11px] text-gray-500">
              <Lock size={11} className="text-gray-400" />
              <span><b className="text-gray-700">Your permissions:</b> {role === "user" ? "Download input files · Upload completed files · Reply to comments" : role === "supervisor" ? "Upload input · Review completed · Add rework comments · Approve" : role === "admin" ? "Upload + view all files · Add comments" : "Full access to all files and history"}</span>
            </div>
          </motion.div>
          );
        })()}

        {tab === "communication" && (() => {
          const channelName = `job-${JOB.number.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${JOB.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
          const cliqUrl = `https://cliq.zoho.com/company/vivid-engineering/channels/${channelName}`;
          const openCliq = () => window.open(cliqUrl, "_blank", "noopener,noreferrer");
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
                  <p className="text-xs text-white/70 mt-1">Dedicated job channel · {WORKERS.length + 1} members · Created when job was assigned</p>
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
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-primary/10 text-primary">{WORKERS.length + 1}</span>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {[{ name: "Sam Carter", avatar: "SC", role: "Supervisor", status: "online" as const, hours: 0 }, ...WORKERS].map((w, i) => (
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
                      <p className="text-[11px] text-gray-500 mt-0.5">Read-only preview · Reply inside Zoho Cliq</p>
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
                      "When a job is created, Vivid Engineering auto-creates a dedicated Cliq channel.",
                      "All assigned workers + the supervisor are added as members automatically.",
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
                  <p className="text-[11px] text-amber-800/80 mb-3">Send a one-off note to the channel without leaving Vivid Engineering.</p>
                  <form onSubmit={(e) => { e.preventDefault(); sendMessage(); }} className="space-y-2">
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder="Type a quick update..."
                      rows={2}
                      className="w-full bg-white rounded-xl px-3 py-2 text-xs border border-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-300 resize-none"
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
                <div className="text-2xl font-bold text-gray-900 font-mono">5h 33m</div>
                <div className="text-[10px] text-gray-500 uppercase tracking-wide">Total</div>
              </div>
            </div>
            {savedLogs.map((l, i) => (
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
                      setShowActivityPing(false);
                      setRunning(false);
                      setSavedLogs((logs) => [{ id: Date.now(), user: "Jordan Reed", duration: formatTime(seconds), task: "Manually stopped", date: "Just now" }, ...logs]);
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
              <p className="text-sm text-gray-500 mb-4">This job will be flagged and the supervisor will be notified.</p>
              <label className="text-xs font-semibold text-gray-700 mb-1.5 block">Reason</label>
              <textarea
                value={reworkReason}
                onChange={(e) => setReworkReason(e.target.value)}
                rows={4}
                placeholder="What needs to be redone?"
                className="w-full bg-white border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary resize-none mb-4"
              />
              <div className="flex gap-2">
                <button onClick={() => setReworkOpen(false)} className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-200">Cancel</button>
                <button onClick={() => setReworkOpen(false)} className="flex-1 py-2.5 bg-amber-500 text-white rounded-xl text-sm font-semibold hover:bg-amber-600 flex items-center justify-center gap-2">
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
                  <h3 className="text-lg font-bold text-gray-900">Approve &amp; Complete Job</h3>
                </div>
                <button onClick={() => setApproveOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
              </div>
              {jobApproved ? (
                <div className="py-6 text-center">
                  <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-3"><CheckCircle2 size={28} /></div>
                  <div className="text-base font-bold text-gray-900">Job approved &amp; marked complete</div>
                  <div className="text-xs text-gray-500 mt-1">The user has been notified.</div>
                </div>
              ) : (
                <>
                  <p className="text-sm text-gray-600 mb-4">Confirm that the deliverables, checklist and time logs all look good. The job will be marked <b>Completed</b> and the user notified.</p>
                  <div className="space-y-2 mb-5 text-xs">
                    <div className="flex items-center gap-2 text-gray-700"><CheckCircle2 size={14} className="text-emerald-500" /> Checklist reviewed ({checklist.filter((c) => c.done).length}/{checklist.length} done)</div>
                    <div className="flex items-center gap-2 text-gray-700"><CheckCircle2 size={14} className="text-emerald-500" /> {files.filter((f) => f.tag === "output").length} completed file(s) submitted</div>
                    <div className="flex items-center gap-2 text-gray-700"><CheckCircle2 size={14} className="text-emerald-500" /> Time logs verified</div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setApproveOpen(false)} className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-200">Cancel</button>
                    <button onClick={() => { setJobApproved(true); setTimeout(() => { setApproveOpen(false); }, 1400); }} className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 flex items-center justify-center gap-2">
                      <CheckCircle2 size={14} /> Approve
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </DashboardLayout>
  );
}
