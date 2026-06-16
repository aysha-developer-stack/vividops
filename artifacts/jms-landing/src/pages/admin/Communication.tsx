import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageCircle, Hash, Search, Send, Paperclip, Smile,
  Phone, Video, MoreHorizontal, ExternalLink, Settings, Check,
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import type { Role } from "@/lib/roles";

type JobApi = {
  id: string;
  number: string;
  title: string;
  status: string;
  client: string;
};

type JobMessageApi = {
  id: string;
  text: string;
  createdAt: string;
  isMe: boolean;
  user: { id: string; name: string };
};

type JobMessageUi = { id: string; user: string; avatar: string; text: string; time: string; isMe: boolean };

type JobCliqChannelApi = {
  channelName: string;
  channelUrl: string | null;
  status: string;
};

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const second = (parts[1]?.[0] ?? parts[0]?.[1] ?? "");
  return `${first}${second}`.toUpperCase();
}

export default function Communication({ role = "super-admin" as Role }: { role?: Role } = {}) {
  const [jobs, setJobs] = useState<JobApi[]>([]);
  const [activeJobId, setActiveJobId] = useState<string>("");
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<JobMessageUi[]>([]);
  const [search, setSearch] = useState("");
  const [cliqChannel, setCliqChannel] = useState<JobCliqChannelApi | null>(null);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/jobs", { credentials: "include" });
        if (!res.ok) return;
        const data = (await res.json()) as unknown;
        if (!Array.isArray(data)) return;
        const next = (data as any[])
          .map((j) => {
            if (!j || typeof j !== "object") return null;
            const obj = j as Partial<JobApi>;
            if (!obj.id || !obj.number || !obj.title || !obj.status || !obj.client) return null;
            return { id: obj.id, number: obj.number, title: obj.title, status: obj.status, client: obj.client };
          })
          .filter(Boolean) as JobApi[];
        if (!cancelled) {
          setJobs(next);
          if (!activeJobId && next[0]?.id) setActiveJobId(next[0].id);
        }
      } catch {
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredJobs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return jobs;
    return jobs.filter((j) => `${j.number} ${j.title} ${j.client}`.toLowerCase().includes(q));
  }, [jobs, search]);

  const activeJob = useMemo(() => jobs.find((j) => j.id === activeJobId) ?? null, [jobs, activeJobId]);

  useEffect(() => {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (!activeJobId) {
      setMessages([]);
      setCliqChannel(null);
      return;
    }

    let cancelled = false;
    const formatMsgTime = (iso: string) => {
      try {
        return new Date(iso).toLocaleString();
      } catch {
        return "—";
      }
    };

    const loadMessages = async () => {
      try {
        const res = await fetch(`/api/jobs/${activeJobId}/messages`, { credentials: "include" });
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

    const loadCliqChannel = async () => {
      try {
        const res = await fetch(`/api/jobs/${activeJobId}/cliq/channel`, { credentials: "include" });
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

    void loadCliqChannel();
    void loadMessages();
    pollRef.current = window.setInterval(() => void loadMessages(), 10000);

    return () => {
      cancelled = true;
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [activeJobId]);

  const openCliq = async () => {
    const url = cliqChannel?.channelUrl;
    if (!url || !activeJobId) return;
    try {
      await fetch(`/api/jobs/${activeJobId}/cliq/join`, { method: "POST", credentials: "include" });
    } catch {
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || !activeJobId) return;
    setDraft("");
    try {
      const res = await fetch(`/api/jobs/${activeJobId}/messages`, {
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

  return (
    <DashboardLayout title="Communication" role={role}>
      {/* Zoho Cliq integration banner */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/20 rounded-2xl p-4 mb-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-3"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary text-white flex items-center justify-center shadow-md shadow-primary/30">
            <MessageCircle size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-gray-900">Zoho Cliq Integration</span>
              {cliqChannel?.status === "active" && (
                <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                  <Check size={10} /> Active
                </span>
              )}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">
              Job messages are stored in the app and can be pushed to a dedicated Cliq channel.
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <motion.button whileHover={{ y: -1 }} whileTap={{ scale: 0.97 }} className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-700 hover:border-gray-300">
            <Settings size={12} /> Settings
          </motion.button>
          <motion.button onClick={openCliq} disabled={!cliqChannel?.channelUrl} whileHover={{ y: -1, scale: 1.02 }} whileTap={{ scale: 0.97 }} className="flex items-center gap-1.5 px-3 py-2 bg-primary hover:bg-primary/90 text-white rounded-lg text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed">
            <ExternalLink size={12} /> Open in Cliq
          </motion.button>
        </div>
      </motion.div>

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden grid grid-cols-1 md:grid-cols-[280px_1fr] h-[calc(100vh-280px)] min-h-[500px]">
        {/* Sidebar */}
        <div className="border-r border-gray-100 flex flex-col bg-gray-50/50">
          <div className="p-4 border-b border-gray-100">
            <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 focus-within:border-primary transition-colors">
              <Search size={14} className="text-gray-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="bg-transparent text-sm flex-1 focus:outline-none" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-5">
            <div>
              <div className="px-3 mb-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Jobs</div>
              <div className="space-y-0.5">
                {filteredJobs.map((j) => {
                  const active = activeJobId === j.id;
                  return (
                    <motion.button
                      key={j.id}
                      whileHover={{ x: 3 }}
                      onClick={() => setActiveJobId(j.id)}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${active ? "bg-primary text-white shadow-md shadow-primary/30" : "text-gray-700 hover:bg-white"}`}
                    >
                      <Hash size={14} className={active ? "text-white" : "text-gray-400"} />
                      <span className="font-medium flex-1 text-left truncate">{j.number} · {j.title}</span>
                    </motion.button>
                  );
                })}
                {filteredJobs.length === 0 && (
                  <div className="px-3 py-2 text-xs text-gray-500">No jobs found</div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Chat area */}
        <div className="flex flex-col min-w-0">
          {/* Chat header */}
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Hash size={16} className="text-gray-400" />
              <span className="font-bold text-gray-900">{activeJob?.number ?? "Select a job"}</span>
              {activeJob?.title && (
                <span className="text-xs text-gray-500 ml-2 hidden sm:inline truncate">· {activeJob.title}</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {[Phone, Video, MoreHorizontal].map((Icon, i) => (
                <motion.button key={i} whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.92 }} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors">
                  <Icon size={16} />
                </motion.button>
              ))}
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <AnimatePresence>
              {messages.map((m, i) => (
                <motion.div
                  key={m.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04, duration: 0.25 }}
                  className={`flex gap-3 ${m.isMe ? "flex-row-reverse" : ""}`}
                >
                  <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${m.isMe ? "from-primary to-sky-700" : "from-gray-300 to-gray-400"} text-white text-xs font-bold flex items-center justify-center shrink-0`}>
                    {m.avatar}
                  </div>
                  <div className={`max-w-md ${m.isMe ? "items-end" : "items-start"} flex flex-col`}>
                    <div className={`flex items-center gap-2 mb-1 ${m.isMe ? "flex-row-reverse" : ""}`}>
                      <span className="text-xs font-semibold text-gray-900">{m.user}</span>
                      <span className="text-[10px] text-gray-400">{m.time}</span>
                    </div>
                    <motion.div
                      whileHover={{ scale: 1.01 }}
                      className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${m.isMe ? "bg-primary text-white rounded-br-sm" : "bg-gray-100 text-gray-800 rounded-bl-sm"}`}
                    >
                      {m.text}
                    </motion.div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            {activeJobId && messages.length === 0 && (
              <div className="text-center text-xs text-gray-500 py-10">No messages yet</div>
            )}
            {!activeJobId && (
              <div className="text-center text-xs text-gray-500 py-10">Select a job to view messages</div>
            )}
          </div>

          {/* Input */}
          <div className="p-4 border-t border-gray-100">
            <div className="flex items-end gap-2 bg-gray-50 border-2 border-gray-200 rounded-2xl px-4 py-2.5 focus-within:border-primary focus-within:bg-white transition-colors">
              <button className="p-1.5 text-gray-400 hover:text-gray-700 transition-colors"><Paperclip size={16} /></button>
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder={activeJob ? `Message ${activeJob.number}…` : "Select a job…"}
                disabled={!activeJobId}
                className="flex-1 bg-transparent text-sm focus:outline-none py-1.5 placeholder-gray-400"
              />
              <button className="p-1.5 text-gray-400 hover:text-gray-700 transition-colors"><Smile size={16} /></button>
              <motion.button
                whileHover={{ scale: 1.06 }}
                whileTap={{ scale: 0.94 }}
                onClick={send}
                disabled={!draft.trim() || !activeJobId}
                className="w-9 h-9 rounded-xl bg-primary hover:bg-primary/90 text-white flex items-center justify-center shadow-md shadow-primary/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Send size={14} />
              </motion.button>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
