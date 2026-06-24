import { 
  Briefcase, Edit3, AlertTriangle, Clock, RefreshCw, Bell, 
  ListChecks, Folder, GraduationCap, BarChart3,
  type LucideIcon 
} from "lucide-react";
import type { Role } from "./roles";

export type NotifType =
  | "assigned"
  | "updated"
  | "overdue"
  | "timer"
  | "rework"
  | "job_message";

export interface Notif {
  id: number;
  type: NotifType;
  title: string;
  desc: string;
  time: string;
  unread: boolean;
}

const defaultNotifStyle = { icon: Bell, color: "bg-gray-100 text-gray-600", label: "Notification" };

export const NOTIF_STYLE: Record<string, { icon: LucideIcon; color: string; label: string }> = {
  assigned: { icon: Briefcase, color: "bg-primary/10 text-primary", label: "Assignment" },
  updated: { icon: Edit3, color: "bg-purple-50 text-purple-600", label: "Update" },
  overdue: { icon: AlertTriangle, color: "bg-red-50 text-red-600", label: "Overdue" },
  timer: { icon: Clock, color: "bg-amber-50 text-amber-600", label: "Timer" },
  rework: { icon: RefreshCw, color: "bg-orange-50 text-orange-600", label: "Rework" },
  job_message: { icon: Bell, color: "bg-sky-50 text-sky-600", label: "Message" },
  checklist: { icon: ListChecks, color: "bg-emerald-50 text-emerald-600", label: "Checklist" },
  file: { icon: Folder, color: "bg-indigo-50 text-indigo-600", label: "File" },
  training: { icon: GraduationCap, color: "bg-rose-50 text-rose-600", label: "Training" },
  error: { icon: AlertTriangle, color: "bg-red-100 text-red-700", label: "Error" },
  progress: { icon: BarChart3, color: "bg-blue-50 text-blue-600", label: "Progress" },
};

export const getNotifStyle = (type: string) => NOTIF_STYLE[type] || defaultNotifStyle;

let activeAudioContext: AudioContext | null = null;

export async function playNotificationTone() {
  if (typeof window === "undefined") return;

  const AudioContextCtor =
    window.AudioContext ||
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!AudioContextCtor) return;

  try {
    activeAudioContext ??= new AudioContextCtor();
    if (activeAudioContext.state === "suspended") {
      await activeAudioContext.resume();
    }

    const startAt = activeAudioContext.currentTime + 0.02;
    const notes = [
      { frequency: 880, duration: 0.12, offset: 0 },
      { frequency: 1320, duration: 0.16, offset: 0.16 },
    ];

    for (const note of notes) {
      const oscillator = activeAudioContext.createOscillator();
      const gain = activeAudioContext.createGain();
      const noteStart = startAt + note.offset;
      const noteEnd = noteStart + note.duration;

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(note.frequency, noteStart);

      gain.gain.setValueAtTime(0.0001, noteStart);
      gain.gain.exponentialRampToValueAtTime(0.12, noteStart + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, noteEnd);

      oscillator.connect(gain);
      gain.connect(activeAudioContext.destination);

      oscillator.start(noteStart);
      oscillator.stop(noteEnd);
    }
  } catch {
    // Ignore browser audio-blocking failures.
  }
}

export const NOTIFICATIONS_BY_ROLE: Record<Role, Notif[]> = {
  "super-admin": [
    { id: 1, type: "overdue", title: "3 jobs overdue across teams", desc: "JOB-2120, JOB-2118, JOB-2099 need attention", time: "5m ago", unread: true },
    { id: 2, type: "rework", title: "Rework requested", desc: "JOB-2147 flagged by Lisa Martinez", time: "1h ago", unread: true },
    { id: 3, type: "updated", title: "Settings changed", desc: "Jamie Rivera updated billing preferences", time: "2h ago", unread: true },
    { id: 4, type: "assigned", title: "New job created", desc: "JOB-2155 assigned to Riley Adams", time: "3h ago", unread: false },
    { id: 5, type: "timer", title: "Timer auto-stopped", desc: "Olivia Carter — JOB-2150 (no activity)", time: "Yesterday", unread: false },
    { id: 6, type: "assigned", title: "Bulk import complete", desc: "47 jobs imported from CSV by Jamie Rivera", time: "Yesterday", unread: false },
    { id: 7, type: "updated", title: "Role permissions changed", desc: "Supervisor role now has report export access", time: "2 days ago", unread: false },
    { id: 8, type: "overdue", title: "Subscription renewal", desc: "Pro plan renews in 7 days — auto-renew is on", time: "3 days ago", unread: false },
  ],
  admin: [
    { id: 1, type: "overdue", title: "Overdue alert", desc: "Engineer Compliance Report (JOB-2118) is 3 days late", time: "10m ago", unread: true },
    { id: 2, type: "assigned", title: "New job created", desc: "Sam Carter assigned JOB-2155 to Jordan Reed", time: "1h ago", unread: true },
    { id: 3, type: "rework", title: "Rework on JOB-2147", desc: "Reason: incorrect footing dimensions noted during inspection", time: "2h ago", unread: true },
    { id: 4, type: "updated", title: "Job priority changed", desc: "JOB-2148 raised to High priority", time: "Yesterday", unread: false },
    { id: 5, type: "timer", title: "Long timer flagged", desc: "Lisa Martinez — 5h on JOB-2147", time: "Yesterday", unread: false },
    { id: 6, type: "assigned", title: "Supervisor onboarded", desc: "Sam Carter has been added to Team B", time: "2 days ago", unread: false },
  ],
  supervisor: [
    { id: 1, type: "rework", title: "Rework requested by Jordan Reed", desc: "JOB-2148 — needs photo redo on east footing", time: "3m ago", unread: true },
    { id: 2, type: "overdue", title: "Your team has 2 overdue jobs", desc: "JOB-2120 (Riley) and JOB-2118 (Olivia)", time: "1h ago", unread: true },
    { id: 3, type: "timer", title: "Long timer session", desc: "Lisa Martinez has been working 5+ hours on JOB-2147", time: "2h ago", unread: true },
    { id: 4, type: "assigned", title: "New job assigned to your team", desc: "JOB-2155 — Crack Assessment from Admin", time: "Yesterday", unread: false },
    { id: 5, type: "updated", title: "Job updated", desc: "Client added new files to JOB-2150", time: "Yesterday", unread: false },
    { id: 6, type: "timer", title: "Auto-stop event", desc: "Riley Adams — timer stopped on JOB-2099", time: "2 days ago", unread: false },
  ],
  user: [
    { id: 1, type: "assigned", title: "New job assigned", desc: "JOB-2151 — Footing Design Review by Sam Carter", time: "5m ago", unread: true },
    { id: 2, type: "timer", title: "Still working?", desc: "Your timer on JOB-2148 has been running 1 hour", time: "12m ago", unread: true },
    { id: 3, type: "updated", title: "Job details updated", desc: "Sam added new checklist items to JOB-2150", time: "1h ago", unread: true },
    { id: 4, type: "overdue", title: "Job due today", desc: "JOB-2148 deadline is at 5:00 PM", time: "2h ago", unread: false },
    { id: 5, type: "rework", title: "Rework cleared", desc: "Sam approved your fix on JOB-2147", time: "Yesterday", unread: false },
    { id: 6, type: "assigned", title: "Training assigned", desc: "Safety Refresh module due by Friday", time: "2 days ago", unread: false },
  ],
};
