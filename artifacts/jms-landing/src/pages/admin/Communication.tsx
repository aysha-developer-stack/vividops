import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageCircle, Hash, Search, Send, Paperclip, Smile,
  Phone, Video, MoreHorizontal, ExternalLink, Check,
  Reply, Copy, Forward, Pencil, Trash2, X,
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { useDashboardSearch } from "@/lib/pageSearch";
import type { Role } from "@/lib/roles";
import { useToast } from "@/hooks/use-toast";
import { collectFilesFromDataTransfer, collectFilesFromList } from "@/lib/collectDroppedFiles";
import JobListSortControl from "@/components/JobListSortControl";
import {
  type JobListSortMode,
  readStoredJobListSort,
  sortJobs,
} from "@/lib/jobListSort";

type JobApi = {
  id: string;
  number: string;
  title: string;
  status: string;
  client: string;
  address?: string | null;
  createdAt?: string;
  updatedAt?: string;
  lastMessageAt?: string | null;
};

type JobMessageApi = {
  id: string;
  text: string;
  createdAt: string;
  isMe: boolean;
  source?: "app" | "zoho_cliq";
  deliveryState?: "local_only" | "sent" | "failed" | "received";
  user: { id: string; name: string };
};

type JobMessageUi = { id: string; user: string; avatar: string; text: string; time: string; isMe: boolean };

type JobCliqChannelApi = {
  channelName: string;
  channelUrl: string | null;
  chatId?: string | null;
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
const CLIQ_WEB_ROOT = "https://cliq.zoho.com.au";

function cliqChatUrl(chatId: string | null | undefined): string | null {
  if (!chatId) return null;
  const companyId = chatId.match(/_(\d+)$/)?.[1];
  if (companyId) {
    return `${CLIQ_WEB_ROOT}/company/${encodeURIComponent(companyId)}/chats/${encodeURIComponent(chatId)}`;
  }
  return `${CLIQ_WEB_ROOT}/app/chats/${encodeURIComponent(chatId)}`;
}

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

function formatReplyQuote(message: JobMessageUi): string {
  const preview = message.text.split("\n")[0]?.trim() || message.text.trim();
  const clipped = preview.length > 120 ? `${preview.slice(0, 120)}…` : preview;
  return `Replying to ${message.user}:\n"${clipped}"`;
}

function buildOutgoingText(draft: string, replyTo: JobMessageUi | null): string {
  const body = draft.trim();
  if (!replyTo) return body;
  return `${formatReplyQuote(replyTo)}\n\n${body}`;
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
  const [unreadByJobId, setUnreadByJobId] = useState<Record<string, number>>({});
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<JobMessageUi[]>([]);
  const { search, setSearch, headerSearch } = useDashboardSearch("Search jobs…");
  const [sortMode, setSortMode] = useState<JobListSortMode>(() => readStoredJobListSort());
  const [cliqChannel, setCliqChannel] = useState<JobCliqChannelApi | null>(null);
  const pollRef = useRef<number | null>(null);
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const attachMenuRef = useRef<HTMLDivElement | null>(null);
  const emojiMenuRef = useRef<HTMLDivElement | null>(null);
  const [attachmentUploading, setAttachmentUploading] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [composerDragging, setComposerDragging] = useState(false);
  const [replyTo, setReplyTo] = useState<JobMessageUi | null>(null);
  const [editingMessage, setEditingMessage] = useState<JobMessageUi | null>(null);
  const [forwardMessage, setForwardMessage] = useState<JobMessageUi | null>(null);
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);
  const composerInputRef = useRef<HTMLInputElement | null>(null);

  const canManageMessage = useCallback(
    (message: JobMessageUi) =>
      message.isMe || role === "super-admin" || role === "admin",
    [role],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/jobs?for=communication", { credentials: "include" });
        if (!res.ok) return;
        const data = (await res.json()) as unknown;
        if (!Array.isArray(data)) return;
        const next = (data as any[])
          .map((j) => {
            if (!j || typeof j !== "object") return null;
            const obj = j as Partial<JobApi>;
            if (!obj.id || !obj.number || !obj.title || !obj.status || !obj.client) return null;
            return {
              id: obj.id,
              number: obj.number,
              title: obj.title,
              status: obj.status,
              client: obj.client,
              address: obj.address ?? null,
              createdAt: typeof obj.createdAt === "string" ? obj.createdAt : undefined,
              updatedAt: typeof obj.updatedAt === "string" ? obj.updatedAt : undefined,
              lastMessageAt: typeof obj.lastMessageAt === "string" ? obj.lastMessageAt : null,
            };
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

  const loadUnreadCounts = useCallback(async () => {
    try {
      const res = await fetch("/api/communication/unread-counts", { credentials: "include" });
      if (!res.ok) return;
      const data = (await res.json()) as { counts?: Record<string, number> };
      if (data.counts && typeof data.counts === "object") {
        setUnreadByJobId(data.counts);
      }
    } catch {
      // optional
    }
  }, []);

  const markJobRead = useCallback(async (jobId: string) => {
    setUnreadByJobId((prev) => {
      if (!prev[jobId]) return prev;
      const next = { ...prev };
      delete next[jobId];
      return next;
    });
    try {
      await fetch(`/api/jobs/${jobId}/messages/read`, {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // optional
    }
  }, []);

  useEffect(() => {
    if (!attachMenuOpen && !emojiOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (attachMenuOpen && attachMenuRef.current && !attachMenuRef.current.contains(target)) {
        setAttachMenuOpen(false);
      }
      if (emojiOpen && emojiMenuRef.current && !emojiMenuRef.current.contains(target)) {
        setEmojiOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [attachMenuOpen, emojiOpen]);

  useEffect(() => {
    if (!actionMenuId) return;
    const close = () => setActionMenuId(null);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [actionMenuId]);

  useEffect(() => {
    void loadUnreadCounts();
    const interval = window.setInterval(() => void loadUnreadCounts(), 15000);
    return () => window.clearInterval(interval);
  }, [loadUnreadCounts]);

  const filteredJobs = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matches = !q
      ? jobs
      : jobs.filter((j) => `${j.number} ${j.title} ${j.client} ${j.address ?? ""}`.toLowerCase().includes(q));
    return sortJobs(matches, sortMode, (j) => ({
      number: j.number,
      status: j.status,
      createdAt: j.createdAt,
      updatedAt: j.updatedAt,
      lastMessageAt: j.lastMessageAt,
      unreadCount: unreadByJobId[j.id] ?? 0,
    }));
  }, [jobs, search, sortMode, unreadByJobId]);

  const activeJob = useMemo(() => jobs.find((j) => j.id === activeJobId) ?? null, [jobs, activeJobId]);

  const scrollToLatestMessages = useCallback((behavior: ScrollBehavior = "auto") => {
    const el = messagesScrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => scrollToLatestMessages("auto"));
    return () => cancelAnimationFrame(frame);
  }, [messages, activeJobId, scrollToLatestMessages]);

  useEffect(() => {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (!activeJobId) {
      setMessages([]);
      setCliqChannel(null);
      setReplyTo(null);
      setEditingMessage(null);
      setActionMenuId(null);
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
        if (!cancelled) {
          setMessages(next);
          void markJobRead(activeJobId);
        }
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
            chatId: typeof obj.chatId === "string" ? obj.chatId : null,
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
  }, [activeJobId, markJobRead]);

  const openCliq = async () => {
    if (!activeJobId) return;
    let url = cliqChatUrl(cliqChannel?.chatId) ?? cliqChannel?.channelUrl;
    try {
      const res = await fetch(`/api/jobs/${activeJobId}/cliq/join`, { method: "POST", credentials: "include" });
      if (res.ok) {
        const data = (await res.json()) as Partial<JobCliqChannelApi>;
        if (typeof data.channelName === "string") {
          const next = {
            channelName: data.channelName,
            channelUrl: typeof data.channelUrl === "string" ? data.channelUrl : null,
            chatId: typeof data.chatId === "string" ? data.chatId : null,
            status: typeof data.status === "string" ? data.status : (cliqChannel?.status ?? "active"),
          };
          setCliqChannel(next);
          url = cliqChatUrl(next.chatId) ?? next.channelUrl ?? `${CLIQ_WEB_ROOT}/channels/${next.channelName}`;
        }
      }
    } catch {
    }
    if (!url) return;
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
    const raw = textOverride ?? draft;
    const text = editingMessage ? raw.trim() : buildOutgoingText(raw, replyTo);
    if (!text || !activeJobId) return;

    if (editingMessage) {
      try {
        const res = await fetch(`/api/jobs/${activeJobId}/messages/${editingMessage.id}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        if (!res.ok) {
          toast({ title: "Edit failed", description: "Could not update message.", variant: "destructive" });
          return;
        }
        const updated = (await res.json()) as JobMessageApi;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === editingMessage.id
              ? {
                  ...m,
                  text: updated.text,
                  time: formatMsgTime(updated.createdAt),
                }
              : m,
          ),
        );
        setEditingMessage(null);
        setDraft("");
        toast({ title: "Message updated" });
      } catch {
        toast({ title: "Edit failed", description: "Could not update message.", variant: "destructive" });
      }
      return;
    }

    if (textOverride === undefined && !options?.preserveDraft) {
      setDraft("");
      setReplyTo(null);
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
      setJobs((prev) =>
        prev.map((j) =>
          j.id === activeJobId
            ? { ...j, lastMessageAt: m.createdAt, updatedAt: m.createdAt }
            : j,
        ),
      );
      if (!options?.preserveDraft) {
        setReplyTo(null);
      }
    } catch {
    }
  };

  const copyMessage = async (message: JobMessageUi) => {
    setActionMenuId(null);
    try {
      await navigator.clipboard.writeText(message.text);
      toast({ title: "Copied to clipboard" });
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  const deleteMessage = async (message: JobMessageUi) => {
    if (!activeJobId) return;
    if (!window.confirm("Delete this message?")) return;
    setActionMenuId(null);
    try {
      const res = await fetch(`/api/jobs/${activeJobId}/messages/${message.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        toast({ title: "Delete failed", variant: "destructive" });
        return;
      }
      setMessages((prev) => prev.filter((m) => m.id !== message.id));
      if (editingMessage?.id === message.id) {
        setEditingMessage(null);
        setDraft("");
      }
      if (replyTo?.id === message.id) setReplyTo(null);
      toast({ title: "Message deleted" });
    } catch {
      toast({ title: "Delete failed", variant: "destructive" });
    }
  };

  const startReply = (message: JobMessageUi) => {
    setActionMenuId(null);
    setEditingMessage(null);
    setReplyTo(message);
    composerInputRef.current?.focus();
  };

  const startEdit = (message: JobMessageUi) => {
    setActionMenuId(null);
    setReplyTo(null);
    setEditingMessage(message);
    setDraft(message.text);
    composerInputRef.current?.focus();
  };

  const cancelComposerMode = () => {
    setReplyTo(null);
    setEditingMessage(null);
    setDraft("");
  };

  const forwardToJob = async (targetJobId: string) => {
    if (!forwardMessage || !activeJob) return;
    const text = `Forwarded from ${activeJob.number} — ${forwardMessage.user}:\n${forwardMessage.text}`;
    try {
      const res = await fetch(`/api/jobs/${targetJobId}/messages`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, pushToCliq: true }),
      });
      if (!res.ok) {
        toast({ title: "Forward failed", variant: "destructive" });
        return;
      }
      const target = jobs.find((j) => j.id === targetJobId);
      toast({ title: "Message forwarded", description: target ? `Sent to ${target.number}` : undefined });
      setForwardMessage(null);
      void loadUnreadCounts();
    } catch {
      toast({ title: "Forward failed", variant: "destructive" });
    }
  };

  const pickAttachment = () => {
    if (!activeJobId || attachmentUploading) return;
    setEmojiOpen(false);
    setAttachMenuOpen((prev) => !prev);
  };

  const uploadAttachment = async (file: File) => {
    if (!activeJobId) return;
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
  };

  const uploadAttachments = async (files: File[]) => {
    if (!activeJobId || files.length === 0) return;
    const allowed = collectFilesFromList(files);
    if (allowed.length === 0) {
      toast({ title: "No files selected", description: "Choose a picture, file, or folder to share.", variant: "destructive" });
      return;
    }
    setAttachMenuOpen(false);
    setEmojiOpen(false);
    setAttachmentUploading(true);
    try {
      for (const file of allowed) {
        await uploadAttachment(file);
      }
      toast({
        title: files.length === 1 ? "Attachment uploaded" : `${files.length} attachments uploaded`,
        description: files.length === 1 ? files[0].name : "Files shared in the chat",
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
    <DashboardLayout title="Communication" role={role} headerSearch={headerSearch}>
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
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-gray-900">Zoho Cliq Integration</span>
              {cliqChannel?.status === "active" && (
                <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                  <Check size={10} /> Active
                </span>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <motion.button onClick={openCliq} disabled={!cliqChannel?.chatId && !cliqChannel?.channelUrl} whileHover={{ y: -1, scale: 1.02 }} whileTap={{ scale: 0.97 }} className="flex items-center gap-1.5 px-3 py-2 bg-primary hover:bg-primary/90 text-white rounded-lg text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed">
              <ExternalLink size={12} /> Open in Cliq
            </motion.button>
          </div>
        </motion.div>

        <div className="flex-1 min-h-0 bg-white rounded-2xl border border-gray-100 overflow-hidden grid grid-cols-1 md:grid-cols-[280px_1fr]">
          <div className="border-r border-gray-100 flex flex-col bg-gray-50/50 min-h-0">
            <div className="p-4 border-b border-gray-100 space-y-3">
              <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 focus-within:border-primary transition-colors">
                <Search size={14} className="text-gray-400" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="bg-transparent text-sm flex-1 focus:outline-none text-gray-900 placeholder-gray-400" />
              </div>
              <JobListSortControl value={sortMode} onChange={setSortMode} variant="sidebar" />
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-5">
              <div>
                <div className="px-3 mb-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Jobs</div>
                <div className="space-y-0.5">
                  {filteredJobs.map((j) => {
                    const active = activeJobId === j.id;
                    const unread = active ? 0 : (unreadByJobId[j.id] ?? 0);
                    return (
                      <motion.button
                        key={j.id}
                        whileHover={{ x: 3 }}
                        onClick={() => {
                          setActiveJobId(j.id);
                          setReplyTo(null);
                          setEditingMessage(null);
                          setDraft("");
                          setActionMenuId(null);
                        }}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${active ? "bg-primary text-white shadow-md shadow-primary/30" : "text-gray-700 hover:bg-white"}`}
                      >
                        <Hash size={14} className={active ? "text-white" : "text-gray-400"} />
                        <span className="font-medium flex-1 text-left min-w-0">
                          <span className="block truncate">{j.number} · {j.title}</span>
                          {(j.address ?? "").trim() ? (
                            <span className={`block truncate text-[10px] mt-0.5 ${active ? "text-white/80" : "text-gray-500"}`}>
                              {j.address}
                            </span>
                          ) : null}
                        </span>
                        {unread > 0 && (
                          <span
                            className={`min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 ${
                              active ? "bg-white text-red-500" : "bg-red-500 text-white"
                            }`}
                          >
                            {unread > 99 ? "99+" : unread}
                          </span>
                        )}
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

            <div ref={messagesScrollRef} className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
              <AnimatePresence>
                {messages.map((m, i) => (
                  <motion.div
                    key={m.id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i * 0.04, 0.4), duration: 0.25 }}
                    className={`group flex gap-3 ${m.isMe ? "flex-row-reverse" : ""}`}
                  >
                    <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${m.isMe ? "from-primary to-sky-700" : "from-gray-300 to-gray-400"} text-white text-xs font-bold flex items-center justify-center shrink-0`}>
                      {m.avatar}
                    </div>
                    <div className={`relative max-w-md ${m.isMe ? "items-end" : "items-start"} flex flex-col`}>
                      <div className={`flex items-center gap-2 mb-1 ${m.isMe ? "flex-row-reverse" : ""}`}>
                        <span className="text-xs font-semibold text-gray-900">{m.user}</span>
                        <span className="text-[10px] text-gray-400">{m.time}</span>
                      </div>
                      <div className={`relative ${m.isMe ? "self-end" : "self-start"}`}>
                        <div
                          className={`absolute ${m.isMe ? "right-0" : "left-0"} -top-9 z-10 flex items-center gap-0.5 rounded-lg border border-gray-200 bg-white px-1 py-0.5 shadow-md opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity`}
                        >
                          <button
                            type="button"
                            onClick={() => startReply(m)}
                            className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                            title="Reply"
                          >
                            <Reply size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => void copyMessage(m)}
                            className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                            title="Copy"
                          >
                            <Copy size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setActionMenuId(null);
                              setForwardMessage(m);
                            }}
                            className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                            title="Forward"
                          >
                            <Forward size={14} />
                          </button>
                          <div className="relative">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActionMenuId((prev) => (prev === m.id ? null : m.id));
                              }}
                              className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                              title="More"
                            >
                              <MoreHorizontal size={14} />
                            </button>
                            {actionMenuId === m.id && (
                              <div
                                className={`absolute top-full mt-1 ${m.isMe ? "right-0" : "left-0"} z-20 w-36 rounded-xl border border-gray-200 bg-white py-1 shadow-xl`}
                                onMouseDown={(e) => e.stopPropagation()}
                              >
                                {canManageMessage(m) && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => startEdit(m)}
                                      className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                                    >
                                      <Pencil size={13} /> Edit
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => void deleteMessage(m)}
                                      className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50"
                                    >
                                      <Trash2 size={13} /> Delete
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        <motion.div
                          whileHover={{ scale: 1.01 }}
                          className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${m.isMe ? "bg-primary text-white rounded-br-sm" : "bg-gray-100 text-gray-800 rounded-bl-sm"}`}
                        >
                          {renderMessageBody(m.text, m.isMe)}
                        </motion.div>
                      </div>
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

            <div className="p-4 border-t border-gray-100 space-y-2">
              {(replyTo || editingMessage) && (
                <div className="flex items-start justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-[11px] font-bold uppercase tracking-wide text-primary">
                      {editingMessage ? "Editing message" : `Replying to ${replyTo?.user}`}
                    </div>
                    <div className="text-xs text-gray-600 truncate mt-0.5">
                      {(editingMessage ?? replyTo)?.text.split("\n")[0]}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={cancelComposerMode}
                    className="p-1 rounded-md text-gray-400 hover:bg-gray-200 hover:text-gray-700"
                    title="Cancel"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
              <input
                ref={attachmentInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = collectFilesFromList(e.target.files);
                  e.target.value = "";
                  if (files.length) void uploadAttachments(files);
                }}
              />
              <input
                ref={folderInputRef}
                type="file"
                multiple
                className="hidden"
                {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
                onChange={(e) => {
                  const files = collectFilesFromList(e.target.files);
                  e.target.value = "";
                  if (files.length) void uploadAttachments(files);
                }}
              />
              <div
                onDragEnter={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!activeJobId || attachmentUploading) return;
                  if (Array.from(e.dataTransfer.types).includes("Files")) setComposerDragging(true);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!activeJobId || attachmentUploading) return;
                  e.dataTransfer.dropEffect = "copy";
                  if (!composerDragging) setComposerDragging(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const next = e.relatedTarget as Node | null;
                  if (next && e.currentTarget.contains(next)) return;
                  setComposerDragging(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setComposerDragging(false);
                  if (!activeJobId || attachmentUploading) return;
                  void (async () => {
                    const files = await collectFilesFromDataTransfer(e.dataTransfer);
                    if (files.length) await uploadAttachments(files);
                  })();
                }}
                className={`relative flex items-end gap-2 rounded-2xl px-4 py-2.5 transition-colors ${
                  composerDragging
                    ? "bg-primary/10 border-2 border-dashed border-primary"
                    : "bg-gray-50 border-2 border-gray-200 focus-within:border-primary focus-within:bg-white"
                }`}
              >
                <div className="relative" ref={attachMenuRef}>
                  <button
                    type="button"
                    onClick={pickAttachment}
                    disabled={!activeJobId || attachmentUploading}
                    className="p-1.5 text-gray-400 hover:text-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Attach picture, file, or folder"
                  >
                    <Paperclip size={16} />
                  </button>
                  {attachMenuOpen && activeJobId && (
                    <div className="absolute bottom-11 left-0 z-10 w-48 rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl">
                      <button
                        type="button"
                        onClick={() => {
                          setAttachMenuOpen(false);
                          attachmentInputRef.current?.click();
                        }}
                        className="w-full text-left px-3 py-2 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50"
                      >
                        Picture or file
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAttachMenuOpen(false);
                          folderInputRef.current?.click();
                        }}
                        className="w-full text-left px-3 py-2 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50"
                      >
                        Folder
                      </button>
                    </div>
                  )}
                </div>
                <input
                  ref={composerInputRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void send()}
                  placeholder={
                    composerDragging
                      ? "Drop pictures, files, or folders to share…"
                      : attachmentUploading
                        ? "Uploading attachment..."
                        : editingMessage
                          ? "Edit message…"
                          : replyTo
                            ? `Reply to ${replyTo.user}…`
                            : activeJob
                              ? `Message ${activeJob.number}…`
                              : "Select a job…"
                  }
                  disabled={!activeJobId || attachmentUploading}
                  className="flex-1 bg-transparent text-sm text-gray-900 focus:outline-none py-1.5 placeholder-gray-400"
                />
                <div className="relative" ref={emojiMenuRef}>
                  <button
                    type="button"
                    onClick={() => {
                      setAttachMenuOpen(false);
                      setEmojiOpen((prev) => !prev);
                    }}
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
                  title={editingMessage ? "Save edit" : "Send"}
                >
                  {editingMessage ? <Check size={14} /> : <Send size={14} />}
                </motion.button>
              </div>
            </div>
          </div>
        </div>

        {forwardMessage && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
            <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-gray-100 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-gray-900 text-sm">Forward message</h3>
                  <p className="text-xs text-gray-500 mt-0.5 truncate">From {forwardMessage.user}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setForwardMessage(null)}
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="max-h-72 overflow-y-auto p-2">
                {jobs
                  .filter((j) => j.id !== activeJobId)
                  .map((j) => (
                    <button
                      key={j.id}
                      type="button"
                      onClick={() => void forwardToJob(j.id)}
                      className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-gray-700 hover:bg-gray-50 text-left"
                    >
                      <Hash size={14} className="text-gray-400 shrink-0" />
                      <span className="truncate">{j.number} · {j.title}</span>
                    </button>
                  ))}
                {jobs.filter((j) => j.id !== activeJobId).length === 0 && (
                  <div className="px-3 py-4 text-xs text-gray-500 text-center">No other jobs available</div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
