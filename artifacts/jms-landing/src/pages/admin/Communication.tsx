import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageCircle, Hash, Lock, Search, Send, Paperclip, Smile,
  Phone, Video, MoreHorizontal, ExternalLink, Settings, Check,
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import type { Role } from "@/lib/roles";

const CHANNELS = [
  { id: "general", name: "general", icon: Hash, unread: 3, type: "channel" },
  { id: "ops-team", name: "ops-team", icon: Hash, unread: 0, type: "channel" },
  { id: "field-supervisors", name: "field-supervisors", icon: Hash, unread: 12, type: "channel" },
  { id: "announcements", name: "announcements", icon: Lock, unread: 1, type: "private" },
];

const DMS = [
  { id: "sarah", name: "Sarah Johnson", status: "online", unread: 2, avatar: "SJ" },
  { id: "mike", name: "Mike Chen", status: "online", unread: 0, avatar: "MC" },
  { id: "emma", name: "Emma Wilson", status: "away", unread: 0, avatar: "EW" },
  { id: "david", name: "David Park", status: "offline", unread: 0, avatar: "DP" },
];

const MESSAGES = [
  { id: 1, user: "Sarah Johnson", avatar: "SJ", text: "Hey team — Server Maintenance #482 is at 72% completion. On track for end of day!", time: "10:24 AM", isMe: false },
  { id: 2, user: "Mike Chen", avatar: "MC", text: "Nice work 🙌 I'll start the inspection report in parallel.", time: "10:26 AM", isMe: false },
  { id: 3, user: "Alex Morgan", avatar: "AM", text: "Great. Make sure to flag any blockers in the channel.", time: "10:31 AM", isMe: true },
  { id: 4, user: "Emma Wilson", avatar: "EW", text: "Quarterly Audit just got marked complete. All clean!", time: "10:42 AM", isMe: false },
  { id: 5, user: "Sarah Johnson", avatar: "SJ", text: "Quick question — should we escalate the overdue Plumbing job?", time: "10:48 AM", isMe: false },
];

const STATUS_DOT: Record<string, string> = {
  online: "bg-emerald-500",
  away: "bg-amber-500",
  offline: "bg-gray-400",
};

export default function Communication({ role = "super-admin" as Role }: { role?: Role } = {}) {
  const [activeChannel, setActiveChannel] = useState("general");
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState(MESSAGES);
  const [search, setSearch] = useState("");

  const send = () => {
    if (!draft.trim()) return;
    setMessages([...messages, {
      id: Date.now(),
      user: "Alex Morgan", avatar: "AM",
      text: draft, time: new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
      isMe: true,
    }]);
    setDraft("");
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
              <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                <Check size={10} /> Connected
              </span>
            </div>
            <div className="text-xs text-gray-500 mt-0.5">All channels and direct messages synced in real time</div>
          </div>
        </div>
        <div className="flex gap-2">
          <motion.button whileHover={{ y: -1 }} whileTap={{ scale: 0.97 }} className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-700 hover:border-gray-300">
            <Settings size={12} /> Settings
          </motion.button>
          <motion.button whileHover={{ y: -1, scale: 1.02 }} whileTap={{ scale: 0.97 }} className="flex items-center gap-1.5 px-3 py-2 bg-primary hover:bg-primary/90 text-white rounded-lg text-xs font-medium">
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
              <div className="px-3 mb-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Channels</div>
              <div className="space-y-0.5">
                {CHANNELS.map((c) => {
                  const Icon = c.icon;
                  const active = activeChannel === c.id;
                  return (
                    <motion.button
                      key={c.id}
                      whileHover={{ x: 3 }}
                      onClick={() => setActiveChannel(c.id)}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${active ? "bg-primary text-white shadow-md shadow-primary/30" : "text-gray-700 hover:bg-white"}`}
                    >
                      <Icon size={14} className={active ? "text-white" : "text-gray-400"} />
                      <span className="font-medium flex-1 text-left">{c.name}</span>
                      {c.unread > 0 && (
                        <span className={`text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center ${active ? "bg-white text-primary" : "bg-primary text-white"}`}>
                          {c.unread}
                        </span>
                      )}
                    </motion.button>
                  );
                })}
              </div>
            </div>
            <div>
              <div className="px-3 mb-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Direct Messages</div>
              <div className="space-y-0.5">
                {DMS.map((d) => {
                  const active = activeChannel === d.id;
                  return (
                    <motion.button
                      key={d.id}
                      whileHover={{ x: 3 }}
                      onClick={() => setActiveChannel(d.id)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${active ? "bg-primary text-white shadow-md shadow-primary/30" : "text-gray-700 hover:bg-white"}`}
                    >
                      <div className="relative shrink-0">
                        <div className={`w-7 h-7 rounded-full bg-gradient-to-br from-primary to-sky-700 text-white text-[10px] font-bold flex items-center justify-center`}>
                          {d.avatar}
                        </div>
                        <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 ${active ? "border-primary" : "border-gray-50"} ${STATUS_DOT[d.status]}`} />
                      </div>
                      <span className="font-medium flex-1 text-left truncate">{d.name}</span>
                      {d.unread > 0 && (
                        <span className={`text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center ${active ? "bg-white text-primary" : "bg-primary text-white"}`}>
                          {d.unread}
                        </span>
                      )}
                    </motion.button>
                  );
                })}
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
              <span className="font-bold text-gray-900">{activeChannel}</span>
              <span className="text-xs text-gray-500 ml-2 hidden sm:inline">· 12 members</span>
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
          </div>

          {/* Input */}
          <div className="p-4 border-t border-gray-100">
            <div className="flex items-end gap-2 bg-gray-50 border-2 border-gray-200 rounded-2xl px-4 py-2.5 focus-within:border-primary focus-within:bg-white transition-colors">
              <button className="p-1.5 text-gray-400 hover:text-gray-700 transition-colors"><Paperclip size={16} /></button>
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder={`Message #${activeChannel}…`}
                className="flex-1 bg-transparent text-sm focus:outline-none py-1.5 placeholder-gray-400"
              />
              <button className="p-1.5 text-gray-400 hover:text-gray-700 transition-colors"><Smile size={16} /></button>
              <motion.button
                whileHover={{ scale: 1.06 }}
                whileTap={{ scale: 0.94 }}
                onClick={send}
                disabled={!draft.trim()}
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
