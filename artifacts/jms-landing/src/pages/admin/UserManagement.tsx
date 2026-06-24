import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Search, MoreVertical, Edit2, Trash2, Power, Shield,
  Crown, UserCog, User as UserIcon, X, Check, Mail, KeyRound,
  Copy, CheckCircle2, AlertTriangle, Loader2, RefreshCw,
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import Pagination, { usePagination } from "@/components/Pagination";
import type { Role } from "@/lib/roles";
import {
  useListUsers,
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
  useResendInvite,
  getListUsersQueryKey,
  type User,
  type UserRole as ApiUserRole,
  type UserStatus as ApiUserStatus,
  ApiError,
} from "@workspace/api-client-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

type UiRole = "Super Admin" | "Admin" | "Supervisor" | "User";

const ROLE_API_TO_UI: Record<ApiUserRole, UiRole> = {
  "super-admin": "Super Admin",
  admin: "Admin",
  supervisor: "Supervisor",
  user: "User",
};
const ROLE_UI_TO_API: Record<UiRole, ApiUserRole> = {
  "Super Admin": "super-admin",
  Admin: "admin",
  Supervisor: "supervisor",
  User: "user",
};

const ROLE_CONFIG: Record<UiRole, { color: string; bg: string; icon: any }> = {
  "Super Admin": { color: "text-purple-700", bg: "bg-purple-50 border-purple-200", icon: Crown },
  Admin: { color: "text-red-700", bg: "bg-red-50 border-red-200", icon: Shield },
  Supervisor: { color: "text-amber-700", bg: "bg-amber-50 border-amber-200", icon: UserCog },
  User: { color: "text-primary", bg: "bg-primary/10 border-primary/20", icon: UserIcon },
};

const formatJoined = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });

const initials = (name: string) =>
  name.trim().split(/\s+/).map((s) => s[0] ?? "").join("").slice(0, 2).toUpperCase() || "?";

export default function UserManagement({ role = "super-admin" as Role }: { role?: Role } = {}) {
  const qc = useQueryClient();
  const usersQuery = useListUsers();
  const createMutation = useCreateUser();
  const updateMutation = useUpdateUser();
  const deleteMutation = useDeleteUser();
  const resendMutation = useResendInvite();
  const isInitialLoading = usersQuery.isLoading && !usersQuery.data;

  const invalidate = useCallback(
    () => qc.invalidateQueries({ queryKey: getListUsersQueryKey() }),
    [qc]
  );

  useEffect(() => {
    invalidate();
  }, [invalidate]);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"All" | UiRole>("All");
  const [openId, setOpenId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    role: "User" as UiRole,
    delivery: "email-invite" as "email-invite" | "temp-password",
  });
  const [credentialResult, setCredentialResult] = useState<{
    name: string; email: string; role: UiRole;
    delivery: "email-invite" | "temp-password";
    tempPassword?: string | null;
    emailSent?: boolean | null;
    emailError?: string | null;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const isSuperAdmin = role === "super-admin";
  const ROLES_TO_SHOW: UiRole[] = isSuperAdmin
    ? ["Super Admin", "Admin", "Supervisor", "User"]
    : ["Supervisor", "User"];
  const FILTER_TABS = ["All", ...ROLES_TO_SHOW] as const;

  const users = usersQuery.data ?? [];
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return users.filter((u) => {
      const ui = ROLE_API_TO_UI[u.role];
      if (filter !== "All" && ui !== filter) return false;
      if (!q) return true;
      return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    });
  }, [users, filter, search]);
  const { page, setPage, totalPages, pageItems, total, pageSize } = usePagination(filtered, 8);

  if (isInitialLoading) {
    return (
      <DashboardLayout title="User Management" role={role}>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </DashboardLayout>
    );
  }

  if (usersQuery.isError) {
    return (
      <DashboardLayout title="User Management" role={role}>
        <div className="px-6 py-10 text-sm text-red-700">
          Failed to load users.
        </div>
      </DashboardLayout>
    );
  }

  const toggleStatus = async (u: User) => {
    setOpenId(null);
    try {
      await updateMutation.mutateAsync({
        id: u.id,
        data: { status: u.status === "active" ? "inactive" : "active" as ApiUserStatus },
      });
      await invalidate();
    } catch (err) {
      setFormError(extractError(err));
    }
  };
  const remove = async (u: User) => {
    setOpenId(null);
    if (!confirm(`Delete ${u.name}? This cannot be undone.`)) return;
    try {
      await deleteMutation.mutateAsync({ id: u.id });
      await invalidate();
    } catch (err) {
      setFormError(extractError(err));
    }
  };
  const resend = async (u: User) => {
    setOpenId(null);
    try {
      const result = await resendMutation.mutateAsync({ id: u.id });
      await invalidate();
      setCredentialResult({
        name: result.user.name,
        email: result.user.email,
        role: ROLE_API_TO_UI[result.user.role],
        delivery: "email-invite",
        emailSent: result.emailSent ?? false,
        emailError: (result as any).emailError ?? null,
      });
    } catch (err) {
      setFormError(extractError(err));
    }
  };

  const startCreate = () => {
    setEditingId(null);
    setForm({ name: "", email: "", role: "User", delivery: "email-invite" });
    setFormError(null);
    setModalOpen(true);
  };
  const startEdit = (u: User) => {
    setEditingId(u.id);
    setForm({
      name: u.name,
      email: u.email,
      role: ROLE_API_TO_UI[u.role],
      delivery: "email-invite",
    });
    setFormError(null);
    setModalOpen(true);
    setOpenId(null);
  };
  const save = async () => {
    if (!form.name || !form.email) {
      setFormError("Name and email are required");
      return;
    }
    setFormError(null);
    try {
      if (editingId !== null) {
        await updateMutation.mutateAsync({
          id: editingId,
          data: {
            name: form.name,
            email: form.email,
            role: ROLE_UI_TO_API[form.role],
          },
        });
        await invalidate();
        setModalOpen(false);
        setEditingId(null);
      } else {
        const result = await createMutation.mutateAsync({
          data: {
            name: form.name,
            email: form.email,
            role: ROLE_UI_TO_API[form.role],
            delivery: form.delivery,
          },
        });
        await invalidate();
        setModalOpen(false);
        setCredentialResult({
          name: result.user.name,
          email: result.user.email,
          role: ROLE_API_TO_UI[result.user.role],
          delivery: result.delivery,
          tempPassword: result.tempPassword ?? null,
          emailSent: result.emailSent ?? null,
          emailError: (result as any).emailError ?? null,
        });
      }
    } catch (err) {
      setFormError(extractError(err));
    }
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

  const isSaving =
    createMutation.isPending || updateMutation.isPending;

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
                className="bg-transparent !text-[#111827] !placeholder:text-gray-400 text-sm flex-1 focus:outline-none"
              />
            </div>
            <div className="flex gap-1 bg-gray-100 p-1 rounded-xl flex-wrap">
              {FILTER_TABS.map((r) => (
                <motion.button
                  key={r}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => setFilter(r as "All" | UiRole)}
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

        {formError && !modalOpen && (
          <div className="px-5 py-3 bg-red-50 border-b border-red-100 text-red-700 text-sm flex items-center gap-2">
            <AlertTriangle size={14} /> {formError}
            <button onClick={() => setFormError(null)} className="ml-auto p-1 hover:bg-red-100 rounded"><X size={12} /></button>
          </div>
        )}

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
              {pageItems.map((u) => {
                const ui = ROLE_API_TO_UI[u.role];
                const cfg = ROLE_CONFIG[ui];
                const Icon = cfg.icon;
                const status = u.status === "active" ? "Active" : "Inactive";
                return (
                  <tr
                    key={u.id}
                    className="border-b border-gray-50 last:border-0 group hover:bg-gray-50"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-sky-700 text-white text-xs font-bold flex items-center justify-center shrink-0">
                          {initials(u.name)}
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
                        {ui}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${status === "Active" ? "bg-emerald-500" : "bg-gray-400"}`} />
                        <span className={`text-sm font-medium ${status === "Active" ? "text-emerald-700" : "text-gray-500"}`}>{status}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">{formatJoined(u.createdAt as unknown as string)}</td>
                    <td className="px-6 py-4 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                          >
                            <MoreVertical size={16} />
                          </motion.button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem onClick={() => startEdit(u)}>
                            <Edit2 size={14} className="mr-2 text-gray-400" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => toggleStatus(u)}>
                            <Power size={14} className="mr-2 text-gray-400" />
                            {status === "Active" ? "Deactivate" : "Activate"}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => resend(u)}>
                            <RefreshCw size={14} className="mr-2 text-gray-400" />
                            Resend invite
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => remove(u)} className="text-red-600 focus:text-red-600 focus:bg-red-50">
                            <Trash2 size={14} className="mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {usersQuery.isLoading && (
            <div className="text-center py-12 text-sm text-gray-400 flex items-center justify-center gap-2">
              <Loader2 size={16} className="animate-spin" /> Loading users…
            </div>
          )}
          {!usersQuery.isLoading && filtered.length === 0 && (
            <div className="text-center py-12 text-sm text-gray-400">No users match your search.</div>
          )}
        </div>
        <Pagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} onChange={setPage} label="users" />
      </motion.div>

      {/* Create User Modal */}
      <AnimatePresence>
        {modalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => !isSaving && setModalOpen(false)} className="absolute inset-0 bg-black/50" />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", stiffness: 300, damping: 28 }}
              className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl max-h-[90vh] flex flex-col overflow-hidden"
            >
              <div className="p-6 border-b border-gray-100 flex items-center justify-between shrink-0">
                <div>
                  <h3 className="font-bold text-gray-900">{editingId !== null ? "Edit User" : "Create New User"}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{editingId !== null ? "Update this team member's details and role" : "Add a new team member to the platform"}</p>
                </div>
                <button onClick={() => { if (!isSaving) { setModalOpen(false); setEditingId(null); } }} className="p-1.5 rounded-lg hover:bg-gray-100"><X size={16} /></button>
              </div>
              <div className="p-6 space-y-4 overflow-y-auto">
                {formError && (
                  <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs flex items-center gap-2">
                    <AlertTriangle size={12} /> {formError}
                  </div>
                )}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Full Name</label>
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="John Doe" className="w-full px-4 py-3 bg-gray-50 border-2 border-gray-200 rounded-xl text-sm !text-[#111827] !placeholder:text-gray-400 focus:outline-none focus:border-primary focus:bg-white transition-colors" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Email Address</label>
                  <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="john@company.com" className="w-full px-4 py-3 bg-gray-50 border-2 border-gray-200 rounded-xl text-sm !text-[#111827] !placeholder:text-gray-400 focus:outline-none focus:border-primary focus:bg-white transition-colors" />
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
              <div className="p-6 border-t border-gray-100 flex justify-end gap-3 shrink-0">
                <button disabled={isSaving} onClick={() => { setModalOpen(false); setEditingId(null); }} className="px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-xl disabled:opacity-50">Cancel</button>
                <motion.button disabled={isSaving} whileHover={!isSaving ? { scale: 1.04 } : undefined} whileTap={!isSaving ? { scale: 0.97 } : undefined} onClick={save} className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white px-5 py-2.5 rounded-xl font-medium text-sm shadow-lg shadow-primary/30 disabled:opacity-70">
                  {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                  {editingId !== null ? "Save Changes" : "Create User"}
                </motion.button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Credential Result Modal */}
      <AnimatePresence>
        {credentialResult && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={closeCredentialModal} className="absolute inset-0 bg-black/50" />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", stiffness: 300, damping: 28 }}
              className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl max-h-[90vh] flex flex-col overflow-hidden"
            >
              <div className="p-6 border-b border-gray-100 flex items-start gap-3 shrink-0">
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

              <div className="p-6 space-y-4 overflow-y-auto">
                {credentialResult.delivery === "email-invite" ? (
                  <>
                    <div className="flex items-start gap-3 p-4 bg-primary/5 border border-primary/20 rounded-xl">
                      <Mail size={18} className="text-primary shrink-0 mt-0.5" />
                      <div className="text-sm text-gray-700 leading-relaxed">
                        {credentialResult.emailSent ? (
                          <>An invitation email has been sent to <span className="font-semibold text-gray-900">{credentialResult.email}</span> with a temporary password and sign-in instructions.</>
                        ) : (
                          <>
                            The account was created but the email could not be sent.
                            {credentialResult.emailError ? (
                              <>
                                {" "}
                                <span className="font-medium text-gray-900">Reason:</span>{" "}
                                <span className="text-gray-900">{credentialResult.emailError}</span>
                              </>
                            ) : (
                              <>
                                {" "}
                                Configure <code className="px-1 py-0.5 bg-amber-100 text-amber-900 rounded text-[11px]">RESEND_API_KEY</code> to enable invite emails, or use the temp-password option to share credentials manually.
                              </>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                    <div className="text-[11px] text-gray-500 leading-relaxed">
                      The user will be required to set a new password on their first sign-in.
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
          </div>
        )}
      </AnimatePresence>
    </DashboardLayout>
  );
}

function extractError(err: unknown): string {
  if (err instanceof ApiError) {
    const data = err.data as { error?: string } | null;
    if (data?.error) return data.error;
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return "Something went wrong";
}
