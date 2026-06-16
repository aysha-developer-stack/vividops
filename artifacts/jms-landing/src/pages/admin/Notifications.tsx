import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Link } from "wouter";
import { ArrowLeft, Check, Filter as FilterIcon } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import Pagination, { usePagination } from "@/components/Pagination";
import { NOTIF_STYLE, type NotifType } from "@/lib/notifications";
import type { Role } from "@/lib/roles";
import { ROLES } from "@/lib/roles";
import {
  getGetNotificationsQueryKey,
  useGetNotifications,
  useMarkNotificationRead,
  type Notification,
} from "@workspace/api-client-react";

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
  const qc = useQueryClient();
  const { data: apiNotifications, isLoading } = useGetNotifications();
  const markReadMutation = useMarkNotificationRead();
  const [filter, setFilter] = useState<"all" | "unread" | NotifType>("all");
  const config = ROLES[role];
  const dashboardPath = config.base;

  const items = useMemo(() => {
    return (apiNotifications ?? []).map(n => ({
      id: n.id,
      type: n.type as NotifType,
      title: n.title,
      desc: n.description,
      time: new Date(n.createdAt).toLocaleString(),
      unread: !n.isRead
    }));
  }, [apiNotifications]);

  const filtered = useMemo(() => {
    if (filter === "all") return items;
    if (filter === "unread") return items.filter((n) => n.unread);
    return items.filter((n) => n.type === filter);
  }, [items, filter]);

  const { page, setPage, totalPages, pageItems, total, pageSize } = usePagination(filtered, 8);

  const unreadCount = items.filter((n) => n.unread).length;

  const setReadInCache = (ids: string[]) => {
    if (ids.length === 0) return;
    const key = getGetNotificationsQueryKey();
    qc.setQueryData(key, (prev: Notification[] | undefined) => {
      if (!prev) return prev;
      const set = new Set(ids);
      return prev.map((n) => (set.has(n.id) ? { ...n, isRead: true } : n));
    });
  };

  const markAll = async () => {
    const unreadIds = (apiNotifications ?? []).filter((n) => !n.isRead).map((n) => n.id);
    if (unreadIds.length === 0) return;

    setReadInCache(unreadIds);
    try {
      await Promise.all(unreadIds.map((id) => markReadMutation.mutateAsync({ id })));
    } catch (err) {
      console.error("Failed to mark all notifications as read:", err);
    } finally {
      await qc.invalidateQueries({ queryKey: getGetNotificationsQueryKey() });
    }
  };

  const toggleOne = async (id: string) => {
    setReadInCache([id]);
    try {
      await markReadMutation.mutateAsync({ id });
    } catch (err) {
      console.error("Failed to mark notification as read:", err);
    } finally {
      await qc.invalidateQueries({ queryKey: getGetNotificationsQueryKey() });
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout title="Notifications" role={role}>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </DashboardLayout>
    );
  }

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
            {pageItems.map((n, i) => {
              const style = NOTIF_STYLE[n.type];
              const NIcon = style.icon;
              return (
                <motion.div
                  key={n.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                  whileHover={n.unread ? { x: 2 } : {}}
                  onClick={() => n.unread && toggleOne(n.id)}
                  className={`px-5 py-4 flex gap-4 relative ${n.unread ? "cursor-pointer hover:bg-gray-50 bg-primary/[0.02]" : ""}`}
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
                  {n.unread && (
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleOne(n.id); }}
                      className="self-start text-[11px] font-semibold text-primary hover:underline shrink-0"
                    >
                      Mark read
                    </button>
                  )}
                </motion.div>
              );
            })}
            {filtered.length === 0 && (
              <div className="px-5 py-16 text-center text-sm text-gray-400">
                No notifications match this filter.
              </div>
            )}
          </div>
          <Pagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} onChange={setPage} label="notifications" />
        </motion.div>
      </div>
    </DashboardLayout>
  );
}
