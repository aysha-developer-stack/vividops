import { useState, useEffect, useRef, ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Settings, Bell, ChevronLeft, LogOut, Search, Menu, Check,
} from "lucide-react";
import logoImg from "@assets/www.vividengineering.com.au__1776838856355.png";
import { getName, getEmail, clearSession } from "@/lib/auth";
import { NOTIF_STYLE, NOTIFICATIONS_BY_ROLE, type Notif } from "@/lib/notifications";
import { ROLES, Role } from "@/lib/roles";

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
  const [name, setName] = useState("Alex Morgan");
  const [email, setEmail] = useState("admin@jobflow.io");
  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setName(getName());
    setEmail(getEmail());
  }, []);

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

  const [notifications, setNotifications] = useState<Notif[]>(NOTIFICATIONS_BY_ROLE[role]);
  useEffect(() => { setNotifications(NOTIFICATIONS_BY_ROLE[role]); }, [role]);
  const unreadCount = notifications.filter((n) => n.unread).length;
  const markAllRead = () => setNotifications((ns) => ns.map((n) => ({ ...n, unread: false })));
  const markOneRead = (id: number) => setNotifications((ns) => ns.map((n) => n.id === id ? { ...n, unread: false } : n));

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
        <div className={`${collapsed ? "h-24" : "h-36"} flex items-center justify-center px-3 border-b border-white/10 shrink-0`}>
          <Link href="/" className="flex flex-col items-center justify-center gap-2 overflow-hidden">
            <img src={logoImg} alt="Vivid Engineering" className={`${collapsed ? "h-14" : "h-24"} w-auto object-contain transition-all`} />
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
                        const style = NOTIF_STYLE[n.type];
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
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-sky-700 text-white text-sm font-bold flex items-center justify-center">
                  {name.split(" ").map((s) => s[0]).join("").slice(0, 2)}
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
                        { label: "Profile Settings", icon: Settings },
                        { label: "Notifications", icon: Bell },
                      ].map((item) => (
                        <motion.button
                          key={item.label}
                          whileHover={{ x: 4 }}
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
