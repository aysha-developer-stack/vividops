import { useState, useEffect, useRef } from "react";
import { Link, useRoute } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, MapPin, Calendar, User, Briefcase, CheckCircle2, Circle,
  Play, Pause, Square, Upload, FileText, Download, MessageCircle, Send,
  RefreshCw, AlertTriangle, Clock, Users, X, Edit2,
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

interface FileItem { id: number; name: string; size: string; type: "doc" | "image" | "pdf"; uploadedBy: string; uploadedAt: string; tag: "working" | "completed" }

const INITIAL_FILES: FileItem[] = [
  { id: 1, name: "site_diagram_v2.pdf", size: "2.4 MB", type: "pdf", uploadedBy: "Sam Carter", uploadedAt: "Yesterday", tag: "working" },
  { id: 2, name: "rack_photo_before.jpg", size: "1.1 MB", type: "image", uploadedBy: "Jordan Reed", uploadedAt: "Today, 9:14am", tag: "working" },
  { id: 3, name: "diagnostics_report.docx", size: "318 KB", type: "doc", uploadedBy: "Jordan Reed", uploadedAt: "Today, 11:02am", tag: "working" },
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
  const [, params] = useRoute(role === "supervisor" ? "/supervisor/jobs/:id" : "/user/jobs/:id");
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
  const [showActivityPing, setShowActivityPing] = useState(false);
  const [autoStopCountdown, setAutoStopCountdown] = useState(30);
  const [savedLogs, setSavedLogs] = useState(INITIAL_TIMER_LOGS);
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
  const handleUpload = (tag: FileItem["tag"]) => {
    const id = Date.now();
    setFiles([{ id, name: `upload_${id}.pdf`, size: "1.0 MB", type: "pdf", uploadedBy: "You", uploadedAt: "Just now", tag }, ...files]);
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
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setReworkOpen(true)}
              className="flex items-center gap-2 px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-xl text-xs font-semibold"
            >
              <RefreshCw size={12} /> Mark for Rework
            </motion.button>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4 pt-4 border-t border-gray-100">
          <div className="flex items-start gap-2.5"><MapPin size={14} className="text-gray-400 mt-0.5" />
            <div><div className="text-[10px] text-gray-500 uppercase font-semibold">Location</div><div className="text-sm text-gray-900 font-medium">{JOB.address}</div></div>
          </div>
          <div className="flex items-start gap-2.5"><Calendar size={14} className="text-gray-400 mt-0.5" />
            <div><div className="text-[10px] text-gray-500 uppercase font-semibold">Start</div><div className="text-sm text-gray-900 font-medium">{JOB.startDate}</div></div>
          </div>
          <div className="flex items-start gap-2.5"><Clock size={14} className="text-amber-500 mt-0.5" />
            <div><div className="text-[10px] text-gray-500 uppercase font-semibold">Est. Completion</div><div className="text-sm text-gray-900 font-medium">{JOB.dueDate}</div></div>
          </div>
          <div className="flex items-start gap-2.5"><CheckCircle2 size={14} className="text-emerald-500 mt-0.5" />
            <div><div className="text-[10px] text-gray-500 uppercase font-semibold">Completed</div><div className="text-sm text-gray-900 font-medium">{JOB.completedDate}</div></div>
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

        {tab === "files" && (
          <motion.div key="fl" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}>
            {/* Upload row */}
            <div className="grid sm:grid-cols-2 gap-3 mb-5">
              {[
                { tag: "working" as const, label: "Upload working file", color: "bg-primary" },
                { tag: "completed" as const, label: "Upload completed file", color: "bg-emerald-500" },
              ].map((b) => (
                <motion.button
                  key={b.tag}
                  whileHover={{ y: -3, scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleUpload(b.tag)}
                  className={`flex items-center justify-center gap-2 px-5 py-4 ${b.color} text-white rounded-2xl text-sm font-semibold shadow-lg shadow-primary/20 border-2 border-dashed border-white/20`}
                >
                  <Upload size={16} /> {b.label}
                </motion.button>
              ))}
            </div>

            {(["working", "completed"] as const).map((bucket) => {
              const list = files.filter((f) => f.tag === bucket);
              const isCompleted = bucket === "completed";
              return (
                <div key={bucket} className="bg-white rounded-2xl border border-gray-100 overflow-hidden mb-5">
                  <div className={`p-5 border-b border-gray-100 flex items-center justify-between ${isCompleted ? "bg-emerald-50/40" : "bg-blue-50/40"}`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isCompleted ? "bg-emerald-500 text-white" : "bg-primary text-white"}`}>
                        {isCompleted ? <CheckCircle2 size={18} /> : <FileText size={18} />}
                      </div>
                      <div>
                        <h3 className="font-bold text-gray-900">{isCompleted ? "Completed Files" : "Working Files"} ({list.length})</h3>
                        <p className="text-[11px] text-gray-500 mt-0.5">
                          {isCompleted
                            ? "Final deliverables submitted at job completion (reports, signed checklists, after-photos)"
                            : "Reference material, in-progress notes and on-site photos uploaded during the job"}
                        </p>
                      </div>
                    </div>
                    <motion.button
                      whileHover={{ scale: 1.04 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => {
                        const id = (files.at(-1)?.id ?? 0) + 1;
                        setFiles([
                          ...files,
                          {
                            id,
                            name: isCompleted ? `completion_doc_${id}.pdf` : `working_note_${id}.docx`,
                            size: isCompleted ? "412 KB" : "186 KB",
                            type: isCompleted ? "pdf" : "doc",
                            uploadedBy: "Jordan Reed",
                            uploadedAt: "Just now",
                            tag: bucket,
                          },
                        ]);
                      }}
                      className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold shadow-md ${isCompleted ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/30" : "bg-primary hover:bg-primary/90 text-white shadow-primary/30"}`}
                    >
                      <Upload size={12} /> Upload {isCompleted ? "Completed" : "Working"}
                    </motion.button>
                  </div>
                  <AnimatePresence>
                    {list.length === 0 && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="px-5 py-10 text-center text-xs text-gray-400">
                        No {isCompleted ? "completion files yet — upload them when the job is done." : "working files uploaded yet."}
                      </motion.div>
                    )}
                    {list.map((f, i) => (
                      <motion.div
                        key={f.id}
                        layout
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        transition={{ delay: i * 0.04 }}
                        whileHover={{ backgroundColor: "rgb(249,250,251)" }}
                        className="flex items-center gap-4 px-5 py-3.5 border-b border-gray-50 last:border-0 group"
                      >
                        <div className={`w-10 h-10 rounded-xl ${FILE_ICON[f.type]} flex items-center justify-center shrink-0`}>
                          <FileText size={18} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-gray-900 truncate">{f.name}</div>
                          <div className="text-[11px] text-gray-500 mt-0.5">
                            {f.size} · {f.uploadedBy} · {f.uploadedAt}
                          </div>
                        </div>
                        {!isCompleted && role === "user" && (
                          <motion.button
                            whileHover={{ scale: 1.04 }}
                            whileTap={{ scale: 0.96 }}
                            onClick={() => setFiles(files.map((x) => (x.id === f.id ? { ...x, tag: "completed" } : x)))}
                            className="text-[10px] font-bold uppercase px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors"
                            title="Mark as completion file"
                          >
                            Mark complete
                          </motion.button>
                        )}
                        <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} className="p-2 rounded-lg text-gray-400 hover:text-primary hover:bg-primary/5 transition-colors opacity-0 group-hover:opacity-100">
                          <Download size={14} />
                        </motion.button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              );
            })}
          </motion.div>
        )}

        {tab === "communication" && (
          <motion.div key="cm" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="bg-white rounded-2xl border border-gray-100 flex flex-col overflow-hidden" style={{ height: 540 }}>
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-sm font-semibold text-gray-900">Job team chat</span>
                <span className="text-xs text-gray-500">· {WORKERS.length} members · Synced with Zoho Cliq</span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((m, i) => (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className={`flex gap-3 ${m.isMe ? "flex-row-reverse" : ""}`}
                >
                  <div className={`w-8 h-8 rounded-full text-white text-xs font-bold flex items-center justify-center shrink-0 ${m.isMe ? "bg-gradient-to-br from-primary to-sky-700" : "bg-gradient-to-br from-gray-700 to-gray-900"}`}>{m.avatar}</div>
                  <div className={`max-w-[75%] ${m.isMe ? "items-end" : ""} flex flex-col`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold text-gray-900">{m.user}</span>
                      <span className="text-[10px] text-gray-400">{m.time}</span>
                    </div>
                    <div className={`px-3.5 py-2 rounded-2xl text-sm ${m.isMe ? "bg-primary text-white rounded-br-sm" : "bg-gray-100 text-gray-900 rounded-bl-sm"}`}>{m.text}</div>
                  </div>
                </motion.div>
              ))}
            </div>
            <form onSubmit={(e) => { e.preventDefault(); sendMessage(); }} className="p-4 border-t border-gray-100 flex items-center gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Type a message…"
                className="flex-1 bg-gray-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:bg-white transition-all"
              />
              <motion.button type="submit" whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.92 }} className="p-2.5 bg-primary text-white rounded-xl hover:bg-primary/90 shadow-md shadow-primary/30">
                <Send size={16} />
              </motion.button>
            </form>
          </motion.div>
        )}

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
      </AnimatePresence>
    </DashboardLayout>
  );
}
