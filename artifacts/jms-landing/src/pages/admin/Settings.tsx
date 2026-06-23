import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  User as UserIcon, Bell, Shield, Globe, Database, Check, Camera, Save, Loader2
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import type { Role } from "@/lib/roles";
import { useAuth } from "@/lib/auth";
import { 
  useUpdateProfile, 
  useResetPassword,
  useGetUserSettings,
  useUpdateUserSettings,
  useGetSystemSettings,
  useUpdateSystemSettings,
  useGetSystemMetrics,
  getGetSystemMetricsQueryKey
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

const TABS = [
  { id: "profile", label: "Profile", icon: UserIcon },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "security", label: "Security", icon: Shield },
  // { id: "appearance", label: "Appearance", icon: Palette },
  { id: "system", label: "System", icon: Database },
  { id: "regional", label: "Regional", icon: Globe },
] as const;

type TabId = typeof TABS[number]["id"];

function Toggle({ on, onChange, disabled }: { on: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      className={`relative w-11 h-6 rounded-full transition-colors ${on ? "bg-primary" : "bg-gray-300"} ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
    >
      <motion.div
        layout
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
        className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow ${on ? "right-0.5" : "left-0.5"}`}
      />
    </button>
  );
}

function Row({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-4 border-b border-gray-100 last:border-0">
      <div>
        <div className="text-sm font-medium text-gray-900">{title}</div>
        {desc && <div className="text-xs text-gray-500 mt-0.5">{desc}</div>}
      </div>
      {children}
    </div>
  );
}

export default function Settings({ role = "super-admin" as Role }: { role?: Role } = {}) {
  const { user, refresh } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState<TabId>("profile");
  const [saved, setSaved] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarRemoving, setAvatarRemoving] = useState(false);
  
  // API Hooks
  const { data: apiUserSettings, refetch: refetchUserSettings } = useGetUserSettings();
  const { data: apiSystemSettings, refetch: refetchSystemSettings } = useGetSystemSettings();
  const { data: apiSystemMetrics } = useGetSystemMetrics({
    query: {
      queryKey: getGetSystemMetricsQueryKey(),
      enabled: role === "super-admin" && tab === "system",
      refetchInterval: 30000, // Refresh every 30s
    }
  });
  
  const updateProfileMutation = useUpdateProfile();
  const resetPasswordMutation = useResetPassword();
  const updateUserSettingsMutation = useUpdateUserSettings();
  const updateSystemSettingsMutation = useUpdateSystemSettings();

  // Profile state
  const [profile, setProfile] = useState({
    name: "",
    email: "",
    phone: "",
    bio: "",
  });

  const avatarUrl = typeof (user as any)?.avatarUrl === "string" ? (user as any).avatarUrl : "";

  // Password state
  const [passwords, setPasswords] = useState({
    current: "",
    new: "",
  });

  // User Settings states (Notification, Appearance, Regional)
  const [userSettingsState, setUserSettingsState] = useState({
    emailNotifications: true,
    pushNotifications: true,
    smsNotifications: false,
    weeklyDigest: true,
    mentions: true,
    twoFactorEnabled: false,
    theme: "light",
    accentColor: "#0B7EB9",
    compactMode: false,
    language: "English (US)",
    timezone: "UTC",
    dateFormat: "MM/DD/YYYY",
    currency: "USD ($)",
  });

  // System Settings state
  const [systemSettingsState, setSystemSettingsState] = useState({
    autoBackup: true,
    maintenanceMode: false,
    apiLogging: true,
  });

  useEffect(() => {
    if (user) {
      setProfile({
        name: user.name || "",
        email: user.email || "",
        phone: (user as any).phone || "",
        bio: (user as any).bio || "",
      });
    }
  }, [user]);

  useEffect(() => {
    if (apiUserSettings) {
      setUserSettingsState({
        emailNotifications: apiUserSettings.emailNotifications,
        pushNotifications: apiUserSettings.pushNotifications,
        smsNotifications: apiUserSettings.smsNotifications,
        weeklyDigest: apiUserSettings.weeklyDigest,
        mentions: apiUserSettings.mentions,
        twoFactorEnabled: apiUserSettings.twoFactorEnabled,
        theme: apiUserSettings.theme,
        accentColor: apiUserSettings.accentColor,
        compactMode: apiUserSettings.compactMode,
        language: apiUserSettings.language,
        timezone: apiUserSettings.timezone,
        dateFormat: apiUserSettings.dateFormat,
        currency: apiUserSettings.currency,
      });
    }
  }, [apiUserSettings]);

  useEffect(() => {
    if (apiSystemSettings) {
      setSystemSettingsState({
        autoBackup: apiSystemSettings.autoBackup,
        maintenanceMode: apiSystemSettings.maintenanceMode,
        apiLogging: apiSystemSettings.apiLogging,
      });
    }
  }, [apiSystemSettings]);

  const handleSave = async () => {
    try {
      if (tab === "profile") {
        await updateProfileMutation.mutateAsync({
          data: {
            name: profile.name,
            email: profile.email,
            phone: profile.phone,
            bio: profile.bio,
          }
        });
        await refresh();
      } else if (tab === "notifications" || tab === "regional" || tab === "security") {
        await updateUserSettingsMutation.mutateAsync({
          data: userSettingsState
        });
        await refetchUserSettings();
      } else if (tab === "system") {
        await updateSystemSettingsMutation.mutateAsync({
          data: systemSettingsState
        });
        await refetchSystemSettings();
      }
      
      setSaved(true);
      toast({ title: "Settings updated", description: "Your changes have been saved successfully." });
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      toast({ 
        title: "Update failed", 
        description: err.info?.error || "Could not update settings.",
        variant: "destructive" 
      });
    }
  };

  const handleUpdatePassword = async () => {
    if (!passwords.current || !passwords.new) {
      toast({ title: "Missing info", description: "Please enter both current and new passwords.", variant: "destructive" });
      return;
    }
    try {
      await resetPasswordMutation.mutateAsync({
        data: {
          currentPassword: passwords.current,
          newPassword: passwords.new,
        }
      });
      setPasswords({ current: "", new: "" });
      toast({ title: "Password updated", description: "Your password has been changed." });
    } catch (err: any) {
      toast({ title: "Update failed", description: err.info?.error || "Could not update password.", variant: "destructive" });
    }
  };

  const isPending = updateProfileMutation.isPending || 
                    resetPasswordMutation.isPending || 
                    updateUserSettingsMutation.isPending || 
                    updateSystemSettingsMutation.isPending;

  const pickAvatar = () => {
    avatarInputRef.current?.click();
  };

  const uploadAvatar = async (file: File) => {
    setAvatarUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/auth/profile/avatar", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Upload failed (${res.status})`);
      }
      await refresh();
      toast({ title: "Photo updated", description: "Your profile photo has been updated." });
    } catch (err: any) {
      toast({
        title: "Upload failed",
        description: err?.message || "Could not upload photo.",
        variant: "destructive",
      });
    } finally {
      setAvatarUploading(false);
    }
  };

  const removeAvatar = async () => {
    setAvatarRemoving(true);
    try {
      await updateProfileMutation.mutateAsync({
        data: {
          avatarUrl: null,
        }
      });
      await refresh();
      toast({ title: "Photo removed", description: "Your profile photo has been removed." });
    } catch (err: any) {
      toast({
        title: "Remove failed",
        description: err?.info?.error || err?.message || "Could not remove photo.",
        variant: "destructive",
      });
    } finally {
      setAvatarRemoving(false);
    }
  };

  return (
    <DashboardLayout title="Settings" role={role}>
      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-6">
        {/* Sidebar tabs */}
        <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="bg-white border border-gray-100 rounded-2xl p-2 h-fit lg:sticky lg:top-6">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <motion.button
                key={t.id}
                onClick={() => setTab(t.id)}
                whileHover={{ x: active ? 0 : 3 }}
                whileTap={{ scale: 0.98 }}
                className={`relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${active ? "text-white" : "text-gray-600 hover:text-gray-900"}`}
              >
                {active && <motion.div layoutId="settingsTab" className="absolute inset-0 bg-primary rounded-xl pointer-events-none" transition={{ type: "spring", stiffness: 300, damping: 25 }} />}
                <span className="relative flex items-center gap-3"><Icon size={16} />{t.label}</span>
              </motion.button>
            );
          })}
        </motion.div>

        {/* Content */}
        <div>
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25 }}
              className="bg-white border border-gray-100 rounded-2xl p-6 md:p-8"
            >
              {tab === "profile" && (
                <>
                  <h3 className="text-lg font-bold text-gray-900 mb-1">Profile information</h3>
                  <p className="text-sm text-gray-500 mb-6">Update your personal details and how others see you.</p>

                  <div className="flex items-center gap-5 mb-8">
                    <motion.div
                      whileHover={{ scale: 1.05 }}
                      onClick={pickAvatar}
                      className="relative w-20 h-20 rounded-full bg-gradient-to-br from-primary to-sky-700 flex items-center justify-center text-white font-bold text-2xl shadow-lg cursor-pointer group overflow-hidden"
                    >
                      {avatarUrl ? (
                        <img src={avatarUrl} alt="Profile" className="w-full h-full object-cover" />
                      ) : (
                        profile.name.split(" ").map(s => s[0]).join("").toUpperCase().slice(0, 2) || "U"
                      )}
                      <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        {avatarUploading ? <Loader2 size={20} className="text-white animate-spin" /> : <Camera size={20} className="text-white" />}
                      </div>
                    </motion.div>
                    <div>
                      <div className="font-semibold text-gray-900">{profile.name || "User"}</div>
                      <div className="text-xs text-gray-500 capitalize">{user?.role || "User"}</div>
                      <button onClick={pickAvatar} disabled={avatarUploading || avatarRemoving} className="text-xs text-primary font-semibold mt-2 hover:underline disabled:opacity-50">
                        {avatarUploading ? "Uploading..." : "Upload new photo"}
                      </button>
                      {avatarUrl && (
                        <button
                          onClick={() => void removeAvatar()}
                          disabled={avatarUploading || avatarRemoving}
                          className="block text-xs text-red-600 font-semibold mt-2 hover:underline disabled:opacity-50"
                        >
                          {avatarRemoving ? "Removing..." : "Remove photo"}
                        </button>
                      )}
                      <input
                        ref={avatarInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = "";
                          if (f) void uploadAvatar(f);
                        }}
                      />
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-semibold text-gray-700 mb-1.5 block">Full name</label>
                      <input
                        value={profile.name}
                        onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                        className="w-full bg-white text-gray-900 placeholder:text-gray-400 border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary transition-colors"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-700 mb-1.5 block">Email</label>
                      <input
                        value={profile.email}
                        onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                        className="w-full bg-white text-gray-900 placeholder:text-gray-400 border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary transition-colors"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-700 mb-1.5 block">Phone</label>
                      <input
                        value={profile.phone}
                        onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                        className="w-full bg-white text-gray-900 placeholder:text-gray-400 border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary transition-colors"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-700 mb-1.5 block">Role</label>
                      <input
                        value={user?.role || ""}
                        disabled
                        className="w-full bg-gray-50 border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-500 cursor-not-allowed"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-xs font-semibold text-gray-700 mb-1.5 block">Bio</label>
                      <textarea
                        value={profile.bio}
                        onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                        rows={3}
                        className="w-full bg-white text-gray-900 placeholder:text-gray-400 border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary transition-colors resize-none"
                      />
                    </div>
                  </div>
                </>
              )}

              {tab === "notifications" && (
                <>
                  <h3 className="text-lg font-bold text-gray-900 mb-1">Notification preferences</h3>
                  <p className="text-sm text-gray-500 mb-4">Choose which notifications you want to receive.</p>
                  <Row title="Email notifications" desc="Job updates, comments, and mentions">
                    <Toggle on={userSettingsState.emailNotifications} onChange={() => setUserSettingsState({ ...userSettingsState, emailNotifications: !userSettingsState.emailNotifications })} />
                  </Row>
                  <Row title="Push notifications" desc="Real-time alerts in the browser">
                    <Toggle on={userSettingsState.pushNotifications} onChange={() => setUserSettingsState({ ...userSettingsState, pushNotifications: !userSettingsState.pushNotifications })} />
                  </Row>
                  <Row title="SMS notifications" desc="Critical alerts only">
                    <Toggle on={userSettingsState.smsNotifications} onChange={() => setUserSettingsState({ ...userSettingsState, smsNotifications: !userSettingsState.smsNotifications })} />
                  </Row>
                  <Row title="Weekly digest" desc="Performance summary every Monday">
                    <Toggle on={userSettingsState.weeklyDigest} onChange={() => setUserSettingsState({ ...userSettingsState, weeklyDigest: !userSettingsState.weeklyDigest })} />
                  </Row>
                  <Row title="@ mentions" desc="When someone tags you in chat">
                    <Toggle on={userSettingsState.mentions} onChange={() => setUserSettingsState({ ...userSettingsState, mentions: !userSettingsState.mentions })} />
                  </Row>
                </>
              )}

              {tab === "security" && (
                <>
                  <h3 className="text-lg font-bold text-gray-900 mb-1">Security & privacy</h3>
                  <p className="text-sm text-gray-500 mb-4">Manage your account security.</p>
                  <Row title="Two-factor authentication" desc="Require a code on every sign-in">
                    <Toggle on={userSettingsState.twoFactorEnabled} onChange={() => setUserSettingsState({ ...userSettingsState, twoFactorEnabled: !userSettingsState.twoFactorEnabled })} />
                  </Row>
                  <div className="pt-6 mt-2 border-t border-gray-100">
                    <h4 className="text-sm font-bold text-gray-900 mb-3">Change password</h4>
                    <div className="grid sm:grid-cols-2 gap-3 mb-4">
                      <input 
                        type="password" 
                        placeholder="Current password" 
                        value={passwords.current}
                        onChange={(e) => setPasswords({ ...passwords, current: e.target.value })}
                        className="bg-white text-gray-900 placeholder:text-gray-400 border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary" 
                      />
                      <input 
                        type="password" 
                        placeholder="New password" 
                        value={passwords.new}
                        onChange={(e) => setPasswords({ ...passwords, new: e.target.value })}
                        className="bg-white text-gray-900 placeholder:text-gray-400 border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary" 
                      />
                    </div>
                    <button
                      onClick={handleUpdatePassword}
                      disabled={resetPasswordMutation.isPending || !passwords.current || !passwords.new}
                      className="text-sm font-semibold text-primary hover:underline disabled:opacity-50"
                    >
                      {resetPasswordMutation.isPending ? "Updating..." : "Update password"}
                    </button>
                  </div>
                </>
              )}

              {/* Appearance Tab (Logic kept, UI removed from app) */}
              {/* {tab === "appearance" && (
                <>
                  <h3 className="text-lg font-bold text-gray-900 mb-1">Appearance</h3>
                  <p className="text-sm text-gray-500 mb-6">Customize how Vivid OPS looks to you.</p>

                  <div className="mb-6">
                    <div className="text-sm font-semibold text-gray-900 mb-3">Theme</div>
                    <div className="grid grid-cols-3 gap-3">
                      {["light", "dark", "system"].map((t) => (
                        <motion.button
                          key={t}
                          whileTap={{ scale: 0.97 }}
                          onClick={() => setUserSettingsState({ ...userSettingsState, theme: t })}
                          className={`relative p-4 rounded-xl border-2 transition-colors capitalize text-sm font-semibold ${userSettingsState.theme === t ? "border-primary bg-primary/5 text-primary" : "border-gray-200 hover:border-gray-300 text-gray-700"}`}
                        >
                          {userSettingsState.theme === t && (
                            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary text-white flex items-center justify-center">
                              <Check size={12} />
                            </motion.div>
                          )}
                          <div className={`w-full h-12 rounded-lg mb-2 ${t === "light" ? "bg-gradient-to-br from-white to-gray-100 border border-gray-200" : t === "dark" ? "bg-gradient-to-br from-gray-800 to-black" : "bg-gradient-to-r from-white via-gray-300 to-gray-900"}`} />
                          {t}
                        </motion.button>
                      ))}
                    </div>
                  </div>

                  <div className="mb-6">
                    <div className="text-sm font-semibold text-gray-900 mb-3">Accent color</div>
                    <div className="flex gap-2">
                      {["#0B7EB9", "#10B981", "#8B5CF6", "#F59E0B", "#EF4444", "#000000"].map((c) => (
                        <motion.button
                          key={c}
                          whileHover={{ scale: 1.15 }}
                          whileTap={{ scale: 0.9 }}
                          onClick={() => setUserSettingsState({ ...userSettingsState, accentColor: c })}
                          className={`w-9 h-9 rounded-full border-2 flex items-center justify-center ${userSettingsState.accentColor === c ? "border-gray-900" : "border-transparent"}`}
                          style={{ backgroundColor: c }}
                        >
                          {userSettingsState.accentColor === c && <Check size={14} className="text-white" />}
                        </motion.button>
                      ))}
                    </div>
                  </div>

                  <Row title="Compact mode" desc="Reduce spacing and padding">
                    <Toggle on={userSettingsState.compactMode} onChange={() => setUserSettingsState({ ...userSettingsState, compactMode: !userSettingsState.compactMode })} />
                  </Row>
                </>
              )} */}

              {tab === "system" && (
                <>
                  <h3 className="text-lg font-bold text-gray-900 mb-1">System</h3>
                  <p className="text-sm text-gray-500 mb-4">Platform configuration and maintenance.</p>
                  <Row title="Auto-backup" desc="Daily database backup at 2:00 AM UTC">
                    <Toggle 
                      on={systemSettingsState.autoBackup} 
                      onChange={() => setSystemSettingsState({ ...systemSettingsState, autoBackup: !systemSettingsState.autoBackup })} 
                      disabled={user?.role !== "super-admin"}
                    />
                  </Row>
                  <Row title="Maintenance mode" desc="Temporarily disable user access">
                    <Toggle 
                      on={systemSettingsState.maintenanceMode} 
                      onChange={() => setSystemSettingsState({ ...systemSettingsState, maintenanceMode: !systemSettingsState.maintenanceMode })} 
                      disabled={user?.role !== "super-admin"}
                    />
                  </Row>
                  <Row title="API access logging" desc="Record all API requests">
                    <Toggle 
                      on={systemSettingsState.apiLogging} 
                      onChange={() => setSystemSettingsState({ ...systemSettingsState, apiLogging: !systemSettingsState.apiLogging })} 
                      disabled={user?.role !== "super-admin"}
                    />
                  </Row>
                  <div className="grid sm:grid-cols-3 gap-3 mt-6">
                    {[
                      { label: "Storage used", value: apiSystemMetrics?.storageUsed || "...", sub: `across ${apiSystemMetrics?.storageFiles?.toLocaleString() || "..."} uploaded files` },
                      { label: "API calls today", value: apiSystemMetrics?.apiCallsToday?.toLocaleString() || "...", sub: apiSystemMetrics?.apiCallsTrend || "..." },
                      { label: "Users", value: apiSystemMetrics?.totalUsers?.toString() || "...", sub: `${apiSystemMetrics?.activeUsers || "0"} active now` },
                    ].map((m) => (
                      <div key={m.label} className="p-4 rounded-xl bg-gray-50">
                        <div className="text-xs text-gray-500 font-medium">{m.label}</div>
                        <div className="text-xl font-bold text-gray-900 mt-1">{m.value}</div>
                        <div className="text-[11px] text-gray-500 mt-0.5">{m.sub}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {tab === "regional" && (
                <>
                  <h3 className="text-lg font-bold text-gray-900 mb-1">Regional settings</h3>
                  <p className="text-sm text-gray-500 mb-6">Language, time zone, and date format.</p>
                  <div className="grid sm:grid-cols-2 gap-4">
                    {[
                      { label: "Language", key: "language", options: ["English (US)", "English (UK)", "Spanish", "French", "German"] },
                      { label: "Time zone", key: "timezone", options: ["UTC", "America/New_York", "America/Los_Angeles", "Europe/London", "Asia/Singapore"] },
                      { label: "Date format", key: "dateFormat", options: ["MM/DD/YYYY", "DD/MM/YYYY", "YYYY-MM-DD"] },
                      { label: "Currency", key: "currency", options: ["USD ($)", "EUR (€)", "GBP (£)", "JPY (¥)"] },
                    ].map((f) => (
                      <div key={f.label}>
                        <label className="text-xs font-semibold text-gray-700 mb-1.5 block">{f.label}</label>
                        <select 
                          value={userSettingsState[f.key as keyof typeof userSettingsState] as string}
                          onChange={(e) => setUserSettingsState({ ...userSettingsState, [f.key]: e.target.value })}
                          className="w-full bg-white border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary transition-colors"
                        >
                          {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Save bar */}
              <div className="flex items-center justify-end gap-3 mt-8 pt-6 border-t border-gray-100">
                <button 
                  onClick={() => {
                    if (tab === "profile" && user) {
                      setProfile({ name: user.name, email: user.email, phone: (user as any).phone || "", bio: (user as any).bio || "" });
                    } else if (apiUserSettings) {
                      setUserSettingsState(apiUserSettings as any);
                    } else if (apiSystemSettings) {
                      setSystemSettingsState(apiSystemSettings as any);
                    }
                  }}
                  className="px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={handleSave}
                  disabled={isPending}
                  className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm font-semibold shadow-md shadow-primary/30 disabled:opacity-50"
                >
                  <AnimatePresence mode="wait">
                    {isPending ? (
                      <motion.span key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2">
                        <Loader2 size={16} className="animate-spin" /> Saving...
                      </motion.span>
                    ) : saved ? (
                      <motion.span key="ok" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="flex items-center gap-2">
                        <Check size={16} /> Saved
                      </motion.span>
                    ) : (
                      <motion.span key="save" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="flex items-center gap-2">
                        <Save size={16} /> Save Changes
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.button>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </DashboardLayout>
  );
}
