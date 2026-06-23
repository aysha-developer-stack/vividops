import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageCircle, Hash, Search, Send, Paperclip, Smile,
  Phone, Video, MoreHorizontal, ExternalLink, Settings, Check,
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import type { Role } from "@/lib/roles";
import { useToast } from "@/hooks/use-toast";

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

type JobAttachmentApi = {
  id: string;
  fileName: string;
  fileUrl: string;
  fileType?: string | null;
};

const QUICK_EMOJIS = ["😀", "👍", "🎉", "✅", "🔥", "🙂", "🙏", "😄"];
const IMAGE_FILE_RE = /\.(png|jpe?g|gif|webp|bmp|svg|avif)(\?.*)?$/i;

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const second = parts[1]?.[0] ?? parts[0]?.[1] ?? "";
  return `${first}${second}`.toUpperCase();
}

function formatMsgTime(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return "—";
  }
}

function parseAttachmentMessage(text: string) {
  const [titleLine, ...rest] = text.split("\n");
  const fileNameMatch = /^Shared attachment:\s*(.+)$/i.exec(titleLine.trim());
  const url = rest.join("\n").trim();
  if (!fileNameMatch || !/^https?:\/\/\S+$/.test(url)) {
    return null;
  }

  const fileName = fileNameMatch[1].trim();
  return {
    fileName,
    url,
    isImage: IMAGE_FILE_RE.test(fileName) || IMAGE_FILE_RE.test(url),
  };
}

function renderMessageText(text: string) {
  const splitRegex = /(https?:\/\/[^\s]+)/g;
  const urlRegex = /^https?:\/\/[^\s]+$/;
  const lines = text.split("\n");
  return lines.map((line, lineIndex) => (
    <span key={`${lineIndex}-${line}`} className="block whitespace-pre-wrap break-words">
      {line.split(splitRegex).map((part, partIndex) => {
        if (urlRegex.test(part)) {
          return (
            <a
              key={`${lineIndex}-${partIndex}-${part}`}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2"
            >
              {part}
            </a>
          );
        }
        return <span key={`${lineIndex}-${partIndex}-${part}`}>{part}</span>;
      })}
    </span>
  ));
}

function renderMessageBody(text: string, isMe: boolean) {
  const attachment = parseAttachmentMessage(text);
  if (!attachment) {
    return renderMessageText(text);
  }

  const mediaBorder = isMe ? "border-white/20" : "border-gray-200";

  if (attachment.isImage) {
    return (
      <div className="space-y-2">
        <div className="text-xs font-semibold opacity-90">{attachment.fileName}</div>
        <a href={attachment.url} target="_blank" rel="noopener noreferrer" className="block">
          <img
            src={attachment.url}
            alt={attachment.fileName}
            className={`block max-h-72 w-auto max-w-full rounded-xl border ${mediaBorder} object-cover bg-white/10`}
            loading="lazy"
          />
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold opacity-90">{attachment.fileName}</div>
      <a href={attachment.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 break-all">
        Open attachment
      </a>
    </div>
  );
}

export default function Communication({ role = "super-admin" as Role }: { role?: Role } = {}) {
  const { toast } = useToast();
  const [jobs, setJobs] = useState<JobApi[]>([]);
  const [activeJobId, setActiveJobId] = useState<string>("");
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<JobMessageUi[]>([]);
  const [search, setSearch] = useState("");
  const [cliqChannel, setCliqChannel] = useState<JobCliqChannelApi | null>(null);
  const pollRef = useRef<number | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const [attachmentUploading, setAttachmentUploading] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);

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

  const appendMessage = (m: JobMessageApi) => {
    setMessages((prev) => [
      ...prev,
      {
        id: m.id,
        user: m.isMe ? "You" : m.user.name,
        avatar: initialsOf(m.user.name),
        text: m.text,
        time: formatMsgTime(m.createdAt),
        isMe: !!m.isMe,
      },
    ]);
  };

  const send = async (textOverride?: string, options?: { preserveDraft?: boolean }) => {
    const text = (textOverride ?? draft).trim();
    if (!text || !activeJobId) return;
    if (textOverride === undefined && !options?.preserveDraft) {
      setDraft("");
    }
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
      appendMessage(m);
    } catch {
    }
  };

  const pickAttachment = () => {
    if (!activeJobId || attachmentUploading) return;
    attachmentInputRef.current?.click();
  };

  const uploadAttachment = async (file: File) => {
    if (!activeJobId) return;
    setAttachmentUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/jobs/${activeJobId}/attachments`, {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Upload failed (${res.status})`);
      }
      const created = await res.json() as JobAttachmentApi;
      if (created?.fileName && created?.fileUrl) {
        await send(`Shared attachment: ${created.fileName}\n${created.fileUrl}`, { preserveDraft: true });
      }
      toast({
        title: "Attachment uploaded",
        description: file.name,
      });
    } catch (err: any) {
      toast({
        title: "Upload failed",
        description: err?.message || "Could not upload attachment.",
        variant: "destructive",
      });
    } finally {
      setAttachmentUploading(false);
    }
  };

  const addEmoji = (emoji: string) => {
    setDraft((prev) => `${prev}${emoji}`);
    setEmojiOpen(false);
  };

  return (
    <DashboardLayout title="Communication" role={role}>
      <div className="flex h-[calc(100dvh-9rem)] min-h-[560px] flex-col">
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

        <div className="flex-1 min-h-0 bg-white rounded-2xl border border-gray-100 overflow-hidden grid grid-cols-1 md:grid-cols-[280px_1fr]">
          <div className="border-r border-gray-100 flex flex-col bg-gray-50/50 min-h-0">
            <div className="p-4 border-b border-gray-100">
              <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 focus-within:border-primary transition-colors">
                <Search size={14} className="text-gray-400" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="bg-transparent text-sm flex-1 focus:outline-none text-gray-900 placeholder-gray-400" />
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

          <div className="flex flex-col min-w-0 min-h-0">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <Hash size={16} className="text-gray-400 shrink-0" />
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

            <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
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
                        {renderMessageBody(m.text, m.isMe)}
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

            <div className="p-4 border-t border-gray-100">
              <div className="relative flex items-end gap-2 bg-gray-50 border-2 border-gray-200 rounded-2xl px-4 py-2.5 focus-within:border-primary focus-within:bg-white transition-colors">
                <button
                  type="button"
                  onClick={pickAttachment}
                  disabled={!activeJobId || attachmentUploading}
                  className="p-1.5 text-gray-400 hover:text-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Upload attachment"
                >
                  <Paperclip size={16} />
                </button>
                <input
                  ref={attachmentInputRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) void uploadAttachment(file);
                  }}
                />
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void send()}
                  placeholder={attachmentUploading ? "Uploading attachment..." : activeJob ? `Message ${activeJob.number}…` : "Select a job…"}
                  disabled={!activeJobId || attachmentUploading}
                  className="flex-1 bg-transparent text-sm text-gray-900 focus:outline-none py-1.5 placeholder-gray-400"
                />
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setEmojiOpen((prev) => !prev)}
                    disabled={!activeJobId}
                    className="p-1.5 text-gray-400 hover:text-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Insert emoji"
                  >
                    <Smile size={16} />
                  </button>
                  {emojiOpen && activeJobId && (
                    <div className="absolute bottom-11 right-0 z-10 w-48 rounded-xl border border-gray-200 bg-white p-2 shadow-xl">
                      <div className="grid grid-cols-4 gap-1">
                        {QUICK_EMOJIS.map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => addEmoji(emoji)}
                            className="rounded-lg px-2 py-2 text-lg hover:bg-gray-100 transition-colors"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <motion.button
                  whileHover={{ scale: 1.06 }}
                  whileTap={{ scale: 0.94 }}
                  onClick={() => void send()}
                  disabled={!draft.trim() || !activeJobId || attachmentUploading}
                  className="w-9 h-9 rounded-xl bg-primary hover:bg-primary/90 text-white flex items-center justify-center shadow-md shadow-primary/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <Send size={14} />
                </motion.button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
