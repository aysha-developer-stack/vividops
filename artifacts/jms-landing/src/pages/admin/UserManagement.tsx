import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Search, MoreVertical, Edit2, Trash2, Power, Shield,
  Crown, UserCog, User as UserIcon, X, Check, Mail, KeyRound,
  Copy, CheckCircle2, AlertTriangle,
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import Pagination, { usePagination } from "@/components/Pagination";
import type { Role } from "@/lib/roles";

type UserRole = "Super Admin" | "Admin" | "Supervisor" | "User";
type Status = "Active" | "Inactive";

interface User {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  status: Status;
  joined: string;
  avatar: string;
}

const ROLE_CONFIG: Record<UserRole, { color: string; bg: string; icon: any }> = {
  "Super Admin": { color: "text-purple-700", bg: "bg-purple-50 border-purple-200", icon: Crown },
  Admin: { color: "text-red-700", bg: "bg-red-50 border-red-200", icon: Shield },
  Supervisor: { color: "text-amber-700", bg: "bg-amber-50 border-amber-200", icon: UserCog },
  User: { color: "text-primary", bg: "bg-primary/10 border-primary/20", icon: UserIcon },
};

const SEED: User[] = [
  { id: 0, name: "Alex Morgan", email: "alex@vividops.com.au", role: "Super Admin", status: "Active", joined: "Jan 02, 2025", avatar: "AM" },
  { id: 1, name: "Sarah Johnson", email: "sarah.j@vividops.com.au", role: "Admin", status: "Active", joined: "Jan 12, 2025", avatar: "SJ" },
  { id: 2, name: "Mike Chen", email: "mike.c@vividops.com.au", role: "Supervisor", status: "Active", joined: "Feb 03, 2025", avatar: "MC" },
  { id: 3, name: "Emma Wilson", email: "emma.w@vividops.com.au", role: "Supervisor", status: "Active", joined: "Feb 14, 2025", avatar: "EW" },
  { id: 4, name: "David Park", email: "david.p@vividops.com.au", role: "User", status: "Active", joined: "Mar 01, 2025", avatar: "DP" },
  { id: 5, name: "Lisa Martinez", email: "lisa.m@vividops.com.au", role: "User", status: "Inactive", joined: "Mar 18, 2025", avatar: "LM" },
  { id: 6, name: "James Bennett", email: "james.b@vividops.com.au", role: "Supervisor", status: "Active", joined: "Apr 02, 2025", avatar: "JB" },
  { id: 7, name: "Olivia Carter", email: "olivia.c@vividops.com.au", role: "User", status: "Active", joined: "Apr 11, 2025", avatar: "OC" },
];

export default function UserManagement({ role = "super-admin" as Role }: { role?: Role } = {}) {
  const [users, setUsers] = useState<User[]>(SEED);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"All" | UserRole>("All");
  const [openId, setOpenId] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    role: "User" as UserRole,
    delivery: "email-invite" as "email-invite" | "temp-password",
  });
  const [credentialResult, setCredentialResult] = useState<{
    name: string; email: string; role: UserRole;
    delivery: "email-invite" | "temp-password"; tempPassword?: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const generateTempPassword = () => {
    const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    const lower = "abcdefghijkmnpqrstuvwxyz";
    const digits = "23456789";
    const symbols = "!@#$%&*";
    const all = upper + lower + digits + symbols;
    const pick = (s: string) => s[Math.floor(Math.random() * s.length)];
    const required = [pick(upper), pick(lower), pick(digits), pick(symbols)];
    const rest = Array.from({ length: 8 }, () => pick(all));
    return [...required, ...rest].sort(() => Math.random() - 0.5).join("");
  };

  const isSuperAdmin = role === "super-admin";
  // Super Admin can manage every role; Admin can manage Supervisor & User only.
  const ROLES_TO_SHOW: UserRole[] = isSuperAdmin
    ? ["Super Admin", "Admin", "Supervisor", "User"]
    : ["Supervisor", "User"];
  const FILTER_TABS = ["All", ...ROLES_TO_SHOW] as const;

  const filtered = users.filter((u) =>
    (filter === "All" || u.role === filter) &&
    (u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase()))
  );
  const { page, setPage, totalPages, pageItems, total, pageSize } = usePagination(filtered, 8);

  const toggleStatus = (id: number) => {
    setUsers(users.map((u) => (u.id === id ? { ...u, status: u.status === "Active" ? "Inactive" : "Active" } : u)));
    setOpenId(null);
  };
  const remove = (id: number) => {
    setUsers(users.filter((u) => u.id !== id));
    setOpenId(null);
  };
  const startCreate = () => {
    setEditingId(null);
    setForm({ name: "", email: "", role: "User", delivery: "email-invite" });
    setModalOpen(true);
  };
  const startEdit = (u: User) => {
    setEditingId(u.id);
    setForm({ name: u.name, email: u.email, role: u.role, delivery: "email-invite" });
    setModalOpen(true);
    setOpenId(null);
  };
  const save = () => {
    if (!form.name || !form.email) return;
    const isCreating = editingId === null;
    if (!isCreating) {
      setUsers(users.map((u) => (u.id === editingId ? { ...u, name: form.name, email: form.email, role: form.role,
        avatar: form.name.split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase() } : u)));
    } else {
      setUsers([{
        id: Date.now(), name: form.name, email: form.email, role: form.role,
        status: "Active", joined: new Date().toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }),
        avatar: form.name.split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase(),
      }, ...users]);
    }
    setModalOpen(false);
    if (isCreating) {
      setCredentialResult({
        name: form.name,
        email: form.email,
        role: form.role,
        delivery: form.delivery,
        tempPassword: form.delivery === "temp-password" ? generateTempPassword() : undefined,
      });
    }
    setEditingId(null);
    setForm({ name: "", email: "", role: "User", delivery: "email-invite" });
  };

  const closeCredentialModal = () => { setCredentialResult(null); setCopied(false); };
  const copyTempPassword = async () => {
    if (!credentialResult?.tempPassword) return;
    try {
      await navigator.clipboard.writeText(credentialResult.tempPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  return (
    <DashboardLayout title="User Management" role={role}>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {/* Toolbar */}
        <div className="p-5 border-b border-gray-100 flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between">
          <div className="flex items-center gap-3 flex-1">
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 flex-1 max-w-md focus-within:border-primary transition-colors">
              <Search size={16} className="text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search users by name or email…"
                className="bg-transparent text-sm flex-1 focus:outline-none"
              />
            </div>
            <div className="flex gap-1 bg-gray-100 p-1 rounded-xl flex-wrap">
              {FILTER_TABS.map((r) => (
                <motion.button
                  key={r}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => setFilter(r as "All" | UserRole)}
                  className={`relative px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${filter === r ? "text-white" : "text-gray-600 hover:text-gray-900"}`}
                >
                  {filter === r && (
                    <motion.div layoutId="filterBg" className="absolute inset-0 bg-primary rounded-lg pointer-events-none" transition={{ type: "spring", stiffness: 300, damping: 25 }} />
                  )}
                  <span className="relative">{r}</span>
                </motion.button>
              ))}
            </div>
          </div>
          <motion.button
            whileHover={{ scale: 1.04, y: -1 }}
            whileTap={{ scale: 0.97 }}
            onClick={startCreate}
            className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white px-5 py-2.5 rounded-xl font-medium text-sm shadow-lg shadow-primary/30 transition-colors"
          >
            <Plus size={16} />
            Create User
          </motion.button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {["User", "Role", "Status", "Joined", ""].map((h) => (
                  <th key={h} className="text-left px-6 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {pageItems.map((u, i) => {
                  const cfg = ROLE_CONFIG[u.role];
                  const Icon = cfg.icon;
                  return (
                    <motion.tr
                      key={u.id}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ delay: i * 0.03 }}
                      whileHover={{ backgroundColor: "rgb(249, 250, 251)" }}
                      className="border-b border-gray-50 last:border-0 group"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-sky-700 text-white text-xs font-bold flex items-center justify-center shrink-0">
                            {u.avatar}
                          </div>
                          <div>
                            <div className="font-medium text-gray-900 text-sm">{u.name}</div>
                            <div className="text-xs text-gray-500">{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold ${cfg.bg} ${cfg.color}`}>
                          <Icon size={11} />
                          {u.role}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <motion.div
                            className={`w-2 h-2 rounded-full ${u.status === "Active" ? "bg-emerald-500" : "bg-gray-400"}`}
                            animate={u.status === "Active" ? { scale: [1, 1.3, 1] } : {}}
                            transition={{ duration: 2, repeat: Infinity }}
                          />
                          <span className={`text-sm font-medium ${u.status === "Active" ? "text-emerald-700" : "text-gray-500"}`}>{u.status}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">{u.joined}</td>
                      <td className="px-6 py-4 text-right relative">
                        <motion.button
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          onClick={() => setOpenId(openId === u.id ? null : u.id)}
                          className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                        >
                          <MoreVertical size={16} />
                        </motion.button>
                        <AnimatePresence>
                          {openId === u.id && (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.95, y: -5 }}
                              animate={{ opacity: 1, scale: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.95, y: -5 }}
                              transition={{ duration: 0.12 }}
                              className="absolute right-6 top-12 w-44 bg-white rounded-xl shadow-xl border border-gray-100 z-10 py-1 text-left"
                            >
                              <button onClick={() => startEdit(u)} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                                <Edit2 size={14} className="text-gray-400" /> Edit
                              </button>
                              <button onClick={() => toggleStatus(u.id)} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                                <Power size={14} className="text-gray-400" /> {u.status === "Active" ? "Deactivate" : "Activate"}
                              </button>
                              <div className="h-px bg-gray-100 my-1" />
                              <button onClick={() => remove(u.id)} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50">
                                <Trash2 size={14} /> Delete
                              </button>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </td>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="text-center py-12 text-sm text-gray-400">No users match your search.</div>
          )}
        </div>
        <Pagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} onChange={setPage} label="users" />
      </motion.div>

      {/* Create User Modal */}
      <AnimatePresence>
        {modalOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setModalOpen(false)} className="fixed inset-0 bg-black/50 z-40" />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", stiffness: 300, damping: 28 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md bg-white rounded-2xl shadow-2xl"
            >
              <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-gray-900">{editingId !== null ? "Edit User" : "Create New User"}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{editingId !== null ? "Update this team member's details and role" : "Add a new team member to the platform"}</p>
                </div>
                <button onClick={() => { setModalOpen(false); setEditingId(null); }} className="p-1.5 rounded-lg hover:bg-gray-100"><X size={16} /></button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Full Name</label>
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="John Doe" className="w-full px-4 py-3 bg-gray-50 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:border-primary focus:bg-white transition-colors" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Email Address</label>
                  <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="john@company.com" className="w-full px-4 py-3 bg-gray-50 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:border-primary focus:bg-white transition-colors" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Assign Role</label>
                  <div className={`grid ${ROLES_TO_SHOW.length === 4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"} gap-2`}>
                    {ROLES_TO_SHOW.map((r) => {
                      const cfg = ROLE_CONFIG[r];
                      const Icon = cfg.icon;
                      const selected = form.role === r;
                      return (
                        <motion.button
                          key={r}
                          whileHover={{ y: -2 }}
                          whileTap={{ scale: 0.96 }}
                          onClick={() => setForm({ ...form, role: r })}
                          className={`p-3 rounded-xl border-2 flex flex-col items-center gap-1.5 transition-colors ${selected ? "border-primary bg-primary/5" : "border-gray-200 hover:border-gray-300"}`}
                        >
                          <Icon size={18} className={selected ? "text-primary" : "text-gray-400"} />
                          <span className={`text-[11px] font-semibold text-center leading-tight ${selected ? "text-primary" : "text-gray-700"}`}>{r}</span>
                        </motion.button>
                      );
                    })}
                  </div>
                </div>

                {editingId === null && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">Sign-in Credentials</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {[
                        { id: "email-invite" as const, icon: Mail, title: "Email an invite", desc: "Send a sign-in link with a setup-password prompt to the user's email." },
                        { id: "temp-password" as const, icon: KeyRound, title: "Generate temp password", desc: "Create a one-time password to share manually. User must reset on first sign-in." },
                      ].map((opt) => {
                        const selected = form.delivery === opt.id;
                        const Icon = opt.icon;
                        return (
                          <motion.button
                            key={opt.id}
                            type="button"
                            whileHover={{ y: -2 }}
                            whileTap={{ scale: 0.97 }}
                            onClick={() => setForm({ ...form, delivery: opt.id })}
                            className={`p-3 rounded-xl border-2 text-left flex gap-2.5 transition-colors ${selected ? "border-primary bg-primary/5" : "border-gray-200 hover:border-gray-300"}`}
                          >
                            <Icon size={16} className={`shrink-0 mt-0.5 ${selected ? "text-primary" : "text-gray-400"}`} />
                            <div>
                              <div className={`text-xs font-semibold leading-tight ${selected ? "text-primary" : "text-gray-800"}`}>{opt.title}</div>
                              <div className="text-[10.5px] text-gray-500 mt-0.5 leading-snug">{opt.desc}</div>
                            </div>
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
                <button onClick={() => { setModalOpen(false); setEditingId(null); }} className="px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-xl">Cancel</button>
                <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }} onClick={save} className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white px-5 py-2.5 rounded-xl font-medium text-sm shadow-lg shadow-primary/30">
                  <Check size={16} /> {editingId !== null ? "Save Changes" : "Create User"}
                </motion.button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Credential Result Modal */}
      <AnimatePresence>
        {credentialResult && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={closeCredentialModal} className="fixed inset-0 bg-black/50 z-40" />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", stiffness: 300, damping: 28 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md bg-white rounded-2xl shadow-2xl"
            >
              <div className="p-6 border-b border-gray-100 flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
                  <CheckCircle2 size={20} className="text-emerald-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-gray-900">User created</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {credentialResult.name} has been added as a {credentialResult.role}.
                  </p>
                </div>
                <button onClick={closeCredentialModal} className="p-1.5 rounded-lg hover:bg-gray-100"><X size={16} /></button>
              </div>

              <div className="p-6 space-y-4">
                {credentialResult.delivery === "email-invite" ? (
                  <>
                    <div className="flex items-start gap-3 p-4 bg-primary/5 border border-primary/20 rounded-xl">
                      <Mail size={18} className="text-primary shrink-0 mt-0.5" />
                      <div className="text-sm text-gray-700 leading-relaxed">
                        An invitation email has been sent to{" "}
                        <span className="font-semibold text-gray-900">{credentialResult.email}</span>.
                        It contains a one-time link to set their password and sign in to Vivid OPS.
                      </div>
                    </div>
                    <div className="text-[11px] text-gray-500 leading-relaxed">
                      The link expires in 48 hours. If the user does not receive it, ask them to check their spam folder or recreate the account using the temporary-password option.
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Email</label>
                      <div className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-800 font-medium">
                        {credentialResult.email}
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Temporary password</label>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 px-3 py-2.5 bg-gray-900 text-emerald-300 rounded-lg text-sm font-mono tracking-wider select-all">
                          {credentialResult.tempPassword}
                        </code>
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={copyTempPassword}
                          className={`px-3 py-2.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${copied ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-primary text-white hover:bg-primary/90"}`}
                        >
                          {copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}
                        </motion.button>
                      </div>
                    </div>
                    <div className="flex items-start gap-2.5 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                      <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                      <div className="text-[11.5px] text-amber-900 leading-relaxed">
                        This password is shown once and cannot be retrieved later. Share it with the user securely. They will be required to set a new password on first sign-in.
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="p-6 border-t border-gray-100 flex justify-end">
                <motion.button
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={closeCredentialModal}
                  className="bg-primary hover:bg-primary/90 text-white px-5 py-2.5 rounded-xl font-medium text-sm shadow-lg shadow-primary/30"
                >
                  Done
                </motion.button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </DashboardLayout>
  );
}
