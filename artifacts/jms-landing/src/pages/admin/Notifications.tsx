import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Link } from "wouter";
import { ArrowLeft, Check, Filter as FilterIcon } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { NOTIFICATIONS_BY_ROLE, NOTIF_STYLE, type Notif, type NotifType } from "@/lib/notifications";
import type { Role } from "@/lib/roles";
import { ROLES } from "@/lib/roles";

const FILTERS: Array<{ id: "all" | "unread" | NotifType; label: string }> = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "assigned", label: "Assignments" },
  { id: "updated", label: "Updates" },
  { id: "overdue", label: "Overdue" },
  { id: "timer", label: "Timer" },
  { id: "rework", label: "Rework" },
];

export default function Notifications({ role = "super-admin" }: { role?: Role }) {
  const [items, setItems] = useState<Notif[]>(NOTIFICATIONS_BY_ROLE[role]);
  const [filter, setFilter] = useState<"all" | "unread" | NotifType>("all");
  const config = ROLES[role];
  const dashboardPath = config.base;

  const filtered = useMemo(() => {
    if (filter === "all") return items;
    if (filter === "unread") return items.filter((n) => n.unread);
    return items.filter((n) => n.type === filter);
  }, [items, filter]);

  const unreadCount = items.filter((n) => n.unread).length;
  const markAll = () => setItems((arr) => arr.map((n) => ({ ...n, unread: false })));
  const toggleOne = (id: number) =>
    setItems((arr) => arr.map((n) => (n.id === id ? { ...n, unread: !n.unread } : n)));

  return (
    <DashboardLayout title="Notifications" role={role}>
      <div className="max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-6"
        >
          <Link href={dashboardPath} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 transition-colors">
            <ArrowLeft size={16} /> Back to dashboard
          </Link>
          <button
            onClick={markAll}
            disabled={unreadCount === 0}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            <Check size={15} /> Mark all read {unreadCount > 0 && `(${unreadCount})`}
          </button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2 overflow-x-auto">
            <FilterIcon size={14} className="text-gray-400 shrink-0" />
            {FILTERS.map((f) => (
              <motion.button
                key={f.id}
                whileTap={{ scale: 0.95 }}
                onClick={() => setFilter(f.id)}
                className={`relative px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap transition-colors ${
                  filter === f.id ? "text-white" : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                }`}
              >
                {filter === f.id && (
                  <motion.div
                    layoutId="notifFilterBg"
                    className="absolute inset-0 bg-primary rounded-lg pointer-events-none"
                    transition={{ type: "spring", stiffness: 350, damping: 28 }}
                  />
                )}
                <span className="relative">
                  {f.label}
                  {f.id === "unread" && unreadCount > 0 && (
                    <span className={`ml-1.5 inline-flex items-center justify-center text-[10px] px-1.5 rounded-full ${filter === f.id ? "bg-white/20" : "bg-red-100 text-red-600"}`}>
                      {unreadCount}
                    </span>
                  )}
                </span>
              </motion.button>
            ))}
          </div>

          <div className="divide-y divide-gray-50">
            {filtered.map((n, i) => {
              const style = NOTIF_STYLE[n.type];
              const NIcon = style.icon;
              return (
                <motion.div
                  key={n.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                  whileHover={{ x: 2 }}
                  onClick={() => toggleOne(n.id)}
                  className={`px-5 py-4 flex gap-4 cursor-pointer hover:bg-gray-50 relative ${n.unread ? "bg-primary/[0.02]" : ""}`}
                >
                  {n.unread && <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />}
                  <div className={`w-11 h-11 rounded-xl ${style.color} flex items-center justify-center shrink-0`}>
                    <NIcon size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-gray-900">{n.title}</span>
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${style.color}`}>
                        {style.label}
                      </span>
                      {n.unread && <span className="w-2 h-2 rounded-full bg-primary" />}
                    </div>
                    <div className="text-xs text-gray-600 mt-1">{n.desc}</div>
                    <div className="text-[11px] text-gray-400 mt-1.5 font-medium">{n.time}</div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleOne(n.id); }}
                    className="self-start text-[11px] font-semibold text-primary hover:underline shrink-0"
                  >
                    {n.unread ? "Mark read" : "Mark unread"}
                  </button>
                </motion.div>
              );
            })}
            {filtered.length === 0 && (
              <div className="px-5 py-16 text-center text-sm text-gray-400">
                No notifications match this filter.
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </DashboardLayout>
  );
}
