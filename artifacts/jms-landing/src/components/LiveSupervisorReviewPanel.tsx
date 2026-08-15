import { useEffect, useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { ClipboardCheck, Clock } from "lucide-react";
import type { Role } from "@/lib/roles";
import {
  fetchActiveReviewCheckSessions,
  liveReviewCheckElapsedSeconds,
  type ReviewCheckSession,
} from "@/lib/reviewCheckSessionApi";

function formatTime(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function LiveSupervisorReviewPanel({ role }: { role: Role }) {
  const [sessions, setSessions] = useState<ReviewCheckSession[]>([]);
  const [tick, setTick] = useState(0);

  const jobBase =
    role === "super-admin" ? "/super-admin/jobs" : role === "admin" ? "/admin/jobs" : "/supervisor/jobs";

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const rows = await fetchActiveReviewCheckSessions();
      if (!cancelled) setSessions(rows.filter((s) => s.isLive || s.segmentStartedAt));
    };
    void load();
    const id = window.setInterval(load, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const live = sessions.filter((s) => s.isLive && s.segmentStartedAt);
  if (live.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-6 rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-indigo-50 overflow-hidden"
    >
      <div className="px-5 py-3 border-b border-violet-100 flex items-center gap-2">
        <ClipboardCheck size={16} className="text-violet-600" />
        <h3 className="text-sm font-bold text-gray-900">Live supervisor review checks</h3>
        <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-violet-700 bg-violet-100 px-2 py-0.5 rounded-full">
          {live.length} active
        </span>
      </div>
      <div className="divide-y divide-violet-100/80">
        {live.map((s) => {
          const elapsed = liveReviewCheckElapsedSeconds(s);
          const label =
            s.jobNumber && s.jobTitle
              ? `${s.jobNumber} · ${s.jobTitle}`
              : s.jobTitle ?? s.jobNumber ?? "Job";
          return (
            <div key={s.id} className="px-5 py-3 flex items-center justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-gray-900">{s.supervisorName ?? "Supervisor"}</div>
                <Link href={`${jobBase}/${s.jobId}`} className="text-xs text-violet-700 hover:underline truncate block">
                  Checking: {label}
                </Link>
              </div>
              <div className="flex items-center gap-2 font-mono text-lg font-bold text-violet-800 tabular-nums">
                <Clock size={16} className="text-violet-500" />
                {formatTime(elapsed)}
                <span className="w-2 h-2 rounded-full bg-violet-500 animate-pulse" />
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
