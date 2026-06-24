import { useState, useEffect, useRef, ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Settings, Bell, ChevronLeft, LogOut, Search, Menu,
} from "lucide-react";
import logoImg from "@assets/vv_1778503190047.png";
import { clearSession, useAuth } from "@/lib/auth";
import { getNotifStyle, playNotificationTone } from "@/lib/notifications";
import { ROLES, Role } from "@/lib/roles";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetDashboardStatsQueryOptions,
  getListUsersQueryOptions,
  getGetTimeLogsQueryOptions,
  getGetPostsQueryOptions,
  getGetNotificationsQueryOptions,
  getGetNotificationsQueryKey,
  useGetNotifications,
  useMarkNotificationRead,
  getListJobsQueryOptions,
} from "@workspace/api-client-react";

export default function DashboardLayout({
  title,
  children,
  role = "super-admin",
}: {
  title: string;
  children: ReactNode;
  role?: Role;
}) {
  const config = ROLES[role];
  const NAV_ITEMS = config.nav;
  const RoleIcon = config.icon;
  const [location, setLocation] = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const seenNotificationIdsRef = useRef<Set<string>>(new Set());
  const initializedNotificationsRef = useRef(false);
  const qc = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleLogout = () => {
    clearSession();
    setLocation("/");
  };

  const name = user?.name ?? "Guest";
  const email = user?.email ?? "";
  const avatarUrl = typeof user?.avatarUrl === "string" ? user.avatarUrl : "";
  const initials = name
    .split(" ")
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const { data: apiNotifications } = useGetNotifications({
    query: {
      queryKey: getGetNotificationsQueryKey(),
      staleTime: 0,
      refetchOnMount: true,
      refetchOnWindowFocus: true,
      refetchInterval: 15000,
      refetchIntervalInBackground: true,
    },
  });
  const markReadMutation = useMarkNotificationRead();

  const notifications = apiNotifications?.map(n => ({
    id: n.id, // Now using string id from API
    type: n.type as any,
    title: n.title,
    desc: n.description,
    time: new Date(n.createdAt).toLocaleString(),
    unread: !n.isRead
  })) || [];

  const unreadCount = notifications.filter((n) => n.unread).length;

  useEffect(() => {
    initializedNotificationsRef.current = false;
    seenNotificationIdsRef.current = new Set();
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;

    const storageKey = `seen-notifications:${user.id}`;
    const currentIds = notifications.map((n) => String(n.id));

    if (!initializedNotificationsRef.current) {
      const mergedIds = new Set(currentIds);
      try {
        const raw = window.sessionStorage.getItem(storageKey);
        const stored = raw ? JSON.parse(raw) : [];
        if (Array.isArray(stored)) {
          for (const id of stored) mergedIds.add(String(id));
        }
      } catch {
      }
      
      // On first load, only allow UNREAD messages to be toasted if they aren't in session storage
      // This ensures "unread messages" show up on login without flooding other alerts
      const unreadMessages = notifications.filter(
        n => n.unread && n.type === "job_message" && !mergedIds.has(String(n.id))
      );

      seenNotificationIdsRef.current = mergedIds;
      initializedNotificationsRef.current = true;
      
      try {
        window.sessionStorage.setItem(storageKey, JSON.stringify(Array.from(mergedIds)));
      } catch {
      }

      if (unreadMessages.length > 0) {
        void playNotificationTone();
        unreadMessages.slice(0, 5).forEach(m => {
          toast({ title: m.title, description: m.desc });
        });
      }
      return;
    }

    const newNotifications = notifications.filter(
      (notification) =>
        notification.unread && !seenNotificationIdsRef.current.has(String(notification.id)),
    );

    if (newNotifications.length === 0) return;

    for (const notification of newNotifications) {
      seenNotificationIdsRef.current.add(String(notification.id));
    }

    try {
      window.sessionStorage.setItem(
        storageKey,
        JSON.stringify(Array.from(seenNotificationIdsRef.current)),
      );
    } catch {
    }

    void playNotificationTone();

    // Separate messages from other alerts to ensure they always show
    const messages = newNotifications.filter(n => n.type === "job_message");
    const otherAlerts = newNotifications.filter(n => n.type !== "job_message");

    // Show up to 5 messages and up to 3 other alerts
    const toToast = [
      ...messages.slice(0, 5),
      ...otherAlerts.slice(0, 3)
    ];

    toToast.forEach((notification) => {
      toast({
        title: notification.title,
        description: notification.desc,
        variant: notification.type === "overdue" ? "destructive" : "default",
      });
    });
  }, [notifications, toast, user?.id]);

  const markAllRead = async () => {
    const unreadIds = notifications.filter((n) => n.unread).map(n => n.id as string);
    if (unreadIds.length === 0) return;

    // Optimistically update cache
    const key = getGetNotificationsQueryKey();
    qc.setQueryData(key, (prev: any) => {
      if (!prev) return prev;
      return prev.map((n: any) => ({ ...n, isRead: true }));
    });

    try {
      await Promise.all(unreadIds.map(id => markReadMutation.mutateAsync({ id })));
    } catch (err) {
      console.error("Failed to mark all as read", err);
      // Invalidate on error
      qc.invalidateQueries({ queryKey: key });
    }
  };

  const markOneRead = async (id: string | number) => {
    const notifId = String(id);
    // Optimistically update cache
    const key = getGetNotificationsQueryKey();
    qc.setQueryData(key, (prev: any) => {
      if (!prev) return prev;
      return prev.map((n: any) => n.id === notifId ? { ...n, isRead: true } : n);
    });

    try {
      await markReadMutation.mutateAsync({ id: notifId });
    } catch (err) {
      console.error("Failed to mark as read", err);
      qc.invalidateQueries({ queryKey: key });
    }
  };

  const prefetchDataForPath = (path: string) => {
    try {
      if (path.includes("/users")) {
        qc.prefetchQuery(getListUsersQueryOptions());
        if (path.includes("/users-monitoring") || path.startsWith("/supervisor/users")) {
          qc.prefetchQuery(getListJobsQueryOptions());
          qc.prefetchQuery(getGetTimeLogsQueryOptions());
        }
      }
      if (path.includes("/jobs")) {
        qc.prefetchQuery(getListJobsQueryOptions());
      }
      if (path.includes("/files") || path.includes("/assignments") || path.includes("/rework-requests")) {
        qc.prefetchQuery(getListJobsQueryOptions());
      }
      if (path.endsWith("/reports") || path.includes("/reports")) {
        qc.prefetchQuery(getGetDashboardStatsQueryOptions());
        qc.prefetchQuery(getListUsersQueryOptions());
        qc.prefetchQuery(getGetTimeLogsQueryOptions());
        qc.prefetchQuery(getListJobsQueryOptions());
      }
      if (path.endsWith("/error-reports") || path.includes("/error-reports")) {
        qc.prefetchQuery(getListUsersQueryOptions());
        qc.prefetchQuery(getListJobsQueryOptions());
        qc.prefetchQuery(getGetTimeLogsQueryOptions());
      }
      if (path.endsWith("/communication") || path.includes("/communication")) {
        qc.prefetchQuery(getListJobsQueryOptions());
      }
      if (path.endsWith("/timer") || path.includes("/timer")) {
        qc.prefetchQuery(getListJobsQueryOptions());
        qc.prefetchQuery(getGetTimeLogsQueryOptions());
      }
      if (path.endsWith("/monitoring") || path.includes("/monitoring")) {
        qc.prefetchQuery(getListUsersQueryOptions());
        qc.prefetchQuery(getListJobsQueryOptions());
        qc.prefetchQuery(getGetTimeLogsQueryOptions());
      }
      if (path.endsWith("/training") || path.includes("/training")) {
        qc.prefetchQuery(getGetPostsQueryOptions());
      }
      if (path.endsWith("/notifications") || path.includes("/notifications")) {
        qc.prefetchQuery(getGetNotificationsQueryOptions());
      }
      if (
        path === "/super-admin" ||
        path === "/admin" ||
        path === "/supervisor" ||
        path === "/user"
      ) {
        qc.prefetchQuery(getGetDashboardStatsQueryOptions());
      }
    } catch {
    }
  };

  const prefetchCodeForPath = (path: string) => {
    if (path === "/super-admin") void import("@/pages/admin/SuperAdminDashboard");
    if (path === "/admin") void import("@/pages/admin/AdminDashboard");
    if (path === "/supervisor") void import("@/pages/admin/SupervisorDashboard");
    if (path === "/user") void import("@/pages/admin/UserDashboard");
    if (path.includes("/users")) {
      if (path.startsWith("/supervisor")) void import("@/pages/admin/UserMonitoring");
      else void import("@/pages/admin/UserManagement");
    }
    if (path.includes("/jobs")) void import("@/pages/admin/JobManagement");
    if (path.includes("/reports")) void import("@/pages/admin/Reports");
    if (path.includes("/communication")) void import("@/pages/admin/Communication");
    if (path.includes("/training")) void import("@/pages/admin/Training");
    if (path.includes("/settings")) void import("@/pages/admin/Settings");
    if (path.startsWith("/user/files")) void import("@/pages/admin/FilesChecklists");
    if (path.startsWith("/super-admin/files")) void import("../pages/admin/SuperAdminFiles");
    if (path.startsWith("/admin/files")) void import("../pages/admin/SuperAdminFiles");
    if (path.includes("/supervisors")) void import("@/pages/admin/SupervisorMonitoring");
    if (path.includes("/monitoring")) void import("@/pages/admin/SystemMonitoring");
    if (path.includes("/roles")) void import("../pages/admin/SuperAdminRolesPermissions");
  };

  const prefetchForPath = (path: string) => {
    prefetchCodeForPath(path);
    // Data prefetching disabled to prevent API congestion on mount
    // prefetchDataForPath(path);
  };

  useEffect(() => {
    if (typeof window === "undefined") return;

    const pathsToWarm = NAV_ITEMS.map((item) => item.path).filter((path) => path !== location);
    if (pathsToWarm.length === 0) return;

    let cancelled = false;
    let idleId: number | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    const warmRouteChunks = () => {
      if (cancelled) return;
      pathsToWarm.forEach((path) => prefetchForPath(path));
    };

    if (typeof idleWindow.requestIdleCallback === "function") {
      idleId = idleWindow.requestIdleCallback(() => warmRouteChunks(), { timeout: 1200 });
    } else {
      timeoutId = setTimeout(warmRouteChunks, 250);
    }

    return () => {
      cancelled = true;
      if (idleId !== null && typeof idleWindow.cancelIdleCallback === "function") {
        idleWindow.cancelIdleCallback(idleId);
      }
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    };
  }, [NAV_ITEMS, location]);

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Mobile overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMobileOpen(false)}
            className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside
        initial={false}
        animate={{ width: collapsed ? 80 : 260 }}
        transition={{ type: "spring", stiffness: 200, damping: 28 }}
        className={`fixed lg:sticky top-0 h-screen bg-black text-white z-40 flex flex-col border-r border-white/10 ${
          mobileOpen ? "left-0" : "-left-full lg:left-0"
        } transition-[left] duration-300`}
      >
        {/* Logo */}
        <div className={`${collapsed ? "h-20" : "h-28"} flex items-center justify-center px-3 border-b border-white/10 shrink-0`}>
          <Link href="/" className="flex flex-col items-center justify-center gap-1.5 overflow-hidden">
            <img src={logoImg} alt="Vivid OPS" className={`${collapsed ? "h-10" : "h-14"} w-auto object-contain transition-all`} />
            <AnimatePresence>
              {!collapsed && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.15 }}
                  className="overflow-hidden text-center"
                >
                  <div className="text-[11px] font-bold text-gray-300 uppercase tracking-[0.18em]">{config.portal}</div>
                </motion.div>
              )}
            </AnimatePresence>
          </Link>
        </div>

        {/* Nav items */}
        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item, i) => {
            const isActive = location === item.path;
            const Icon = item.icon;
            return (
              <Link key={item.path} href={item.path}>
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                  whileHover={{ x: 4 }}
                  className={`relative flex items-center gap-3 px-3 py-3 rounded-xl cursor-pointer group transition-colors ${
                    isActive ? "bg-primary text-white shadow-lg shadow-primary/30" : "text-gray-400 hover:bg-white/5 hover:text-white"
                  }`}
                  onClick={() => setMobileOpen(false)}
                  onMouseDown={() => prefetchCodeForPath(item.path)}
                  onMouseEnter={() => prefetchForPath(item.path)}
                  onFocus={() => prefetchForPath(item.path)}
                  onTouchStart={() => prefetchCodeForPath(item.path)}
                >
                  {isActive && (
                    <motion.div
                      layoutId="activeNavBg"
                      className="absolute inset-0 bg-primary rounded-xl pointer-events-none"
                      transition={{ type: "spring", stiffness: 300, damping: 25 }}
                    />
                  )}
                  <Icon size={18} className="shrink-0 relative" />
                  <AnimatePresence>
                    {!collapsed && (
                      <motion.span
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -8 }}
                        transition={{ duration: 0.15 }}
                        className="relative text-sm font-medium overflow-hidden whitespace-nowrap"
                      >
                        {item.label}
                      </motion.span>
                    )}
                  </AnimatePresence>
                  {collapsed && (
                    <span className="absolute left-full ml-3 px-2 py-1 bg-black border border-white/10 rounded-md text-xs font-medium opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50 shadow-lg">
                      {item.label}
                    </span>
                  )}
                </motion.div>
              </Link>
            );
          })}
        </nav>

        {/* Collapse toggle */}
        <div className="p-3 border-t border-white/10 shrink-0">
          <motion.button
            onClick={() => setCollapsed(!collapsed)}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="hidden lg:flex w-full items-center justify-center p-2 rounded-lg text-gray-400 hover:bg-white/5 hover:text-white transition-colors"
          >
            <motion.div animate={{ rotate: collapsed ? 180 : 0 }} transition={{ duration: 0.3 }}>
              <ChevronLeft size={16} />
            </motion.div>
          </motion.button>
        </div>
      </motion.aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="h-20 bg-white border-b border-gray-200 sticky top-0 z-20 flex items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              <Menu size={20} />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <RoleIcon size={14} className="text-primary" />
                <span className="text-xs font-semibold text-primary uppercase tracking-wider">{config.label}</span>
              </div>
              <h1 className="text-xl font-bold text-gray-900">{title}</h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="hidden md:flex items-center gap-2 bg-gray-100 rounded-xl px-4 py-2 w-72 border border-transparent hover:border-gray-200 focus-within:border-primary focus-within:bg-white transition-all">
              <Search size={16} className="text-gray-400" />
              <input
                placeholder="Search anything…"
                className="bg-transparent text-sm flex-1 focus:outline-none placeholder-gray-400"
              />
            </div>

            {/* Notifications */}
            <div className="relative" ref={notifRef}>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.92 }}
                onClick={() => setNotifOpen(!notifOpen)}
                className="relative p-2.5 text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
              >
                <Bell size={18} />
                {unreadCount > 0 && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center"
                  >
                    {unreadCount}
                  </motion.span>
                )}
                {unreadCount > 0 && (
                  <motion.span
                    className="absolute top-1 right-1 w-4 h-4 bg-red-500 rounded-full"
                    animate={{ scale: [1, 1.6, 1], opacity: [0.6, 0, 0.6] }}
                    transition={{ duration: 1.8, repeat: Infinity }}
                  />
                )}
              </motion.button>
              <AnimatePresence>
                {notifOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full mt-2 w-96 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden"
                  >
                    <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                      <h3 className="font-semibold text-gray-900">Notifications</h3>
                      <button
                        type="button"
                        onClick={markAllRead}
                        disabled={unreadCount === 0}
                        className="text-xs text-primary font-medium hover:underline disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed"
                      >
                        Mark all read
                      </button>
                    </div>
                    <div className="max-h-96 overflow-y-auto">
                      {notifications.map((n, i) => {
                        const style = getNotifStyle(n.type);
                        const NIcon = style.icon;
                        return (
                          <motion.div
                            key={n.id}
                            initial={{ opacity: 0, x: 10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.04 }}
                            whileHover={{ x: 3 }}
                            onClick={() => markOneRead(n.id)}
                            className={`px-5 py-3 border-b border-gray-50 hover:bg-gray-50 cursor-pointer flex gap-3 relative ${n.unread ? "bg-primary/[0.02]" : ""}`}
                          >
                            {n.unread && <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />}
                            <div className={`w-9 h-9 rounded-xl ${style.color} flex items-center justify-center shrink-0`}>
                              <NIcon size={15} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm font-semibold text-gray-900 truncate">{n.title}</span>
                                {n.unread && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
                              </div>
                              <div className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.desc}</div>
                              <div className="text-[10px] text-gray-400 mt-1 uppercase tracking-wider font-medium">{n.type} · {n.time}</div>
                            </div>
                          </motion.div>
                        );
                      })}
                      {notifications.length === 0 && (
                        <div className="px-5 py-12 text-center text-xs text-gray-400">You're all caught up 🎉</div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setNotifOpen(false);
                        setLocation(`${ROLES[role].base}/notifications`);
                      }}
                      className="block w-full px-5 py-3 text-center text-xs text-primary font-semibold hover:bg-gray-50"
                    >
                      View all notifications →
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Profile */}
            <div className="relative" ref={profileRef}>
              <motion.button
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                onClick={() => setProfileOpen(!profileOpen)}
                className="flex items-center gap-3 pl-2 pr-3 py-1.5 hover:bg-gray-100 rounded-xl transition-colors"
              >
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-sky-700 text-white text-sm font-bold flex items-center justify-center overflow-hidden">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt={name} className="w-full h-full object-cover" />
                  ) : (
                    initials
                  )}
                </div>
                <div className="hidden md:block text-left">
                  <div className="text-sm font-semibold text-gray-900 leading-tight">{name}</div>
                  <div className="text-[10px] text-gray-500">{config.label}</div>
                </div>
              </motion.button>
              <AnimatePresence>
                {profileOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full mt-2 w-64 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden"
                  >
                    <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-br from-primary/5 to-transparent">
                      <div className="font-semibold text-gray-900">{name}</div>
                      <div className="text-xs text-gray-500">{email}</div>
                    </div>
                    <div className="py-2">
                      {[
                        { label: "Profile Settings", icon: Settings, path: `${config.base}/settings` },
                        { label: "Notifications", icon: Bell, path: `${config.base}/notifications` },
                      ].map((item) => (
                        <motion.button
                          key={item.label}
                          whileHover={{ x: 4 }}
                          onClick={() => {
                            setProfileOpen(false);
                            setLocation(item.path);
                          }}
                          className="w-full flex items-center gap-3 px-5 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                          <item.icon size={16} className="text-gray-400" />
                          {item.label}
                        </motion.button>
                      ))}
                    </div>
                    <div className="border-t border-gray-100 py-2">
                      <motion.button
                        whileHover={{ x: 4 }}
                        onClick={handleLogout}
                        className="w-full flex items-center gap-3 px-5 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <LogOut size={16} />
                        Sign Out
                      </motion.button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-6 md:p-8 overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
