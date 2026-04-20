import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  User, Bell, Shield, Palette, Globe, Database, Check, Camera, Save,
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import type { Role } from "@/lib/roles";

const TABS = [
  { id: "profile", label: "Profile", icon: User },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "security", label: "Security", icon: Shield },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "system", label: "System", icon: Database },
  { id: "regional", label: "Regional", icon: Globe },
] as const;

type TabId = typeof TABS[number]["id"];

function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      className={`relative w-11 h-6 rounded-full transition-colors ${on ? "bg-primary" : "bg-gray-300"}`}
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
  const [tab, setTab] = useState<TabId>("profile");
  const [saved, setSaved] = useState(false);
  const [profile, setProfile] = useState({
    name: "Alex Morgan",
    email: "alex@jobflow.io",
    role: "Super Admin",
    phone: "+1 (555) 123-4567",
    bio: "Operations lead at Vivid Engineering, overseeing the JobFlow platform.",
  });
  const [notif, setNotif] = useState({ email: true, push: true, sms: false, weekly: true, mentions: true });
  const [appearance, setAppearance] = useState({ theme: "light", accent: "#0B7EB9", compact: false });
  const [security, setSecurity] = useState({ twoFA: true, sessionAlerts: true });

  const save = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
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
                {active && <motion.div layoutId="settingsTab" className="absolute inset-0 bg-primary rounded-xl -z-10" transition={{ type: "spring", stiffness: 300, damping: 25 }} />}
                <Icon size={16} />
                {t.label}
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
                    <motion.div whileHover={{ scale: 1.05 }} className="relative w-20 h-20 rounded-full bg-gradient-to-br from-primary to-sky-700 flex items-center justify-center text-white font-bold text-2xl shadow-lg cursor-pointer group">
                      AM
                      <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Camera size={20} className="text-white" />
                      </div>
                    </motion.div>
                    <div>
                      <div className="font-semibold text-gray-900">{profile.name}</div>
                      <div className="text-xs text-gray-500">{profile.role}</div>
                      <button className="text-xs text-primary font-semibold mt-2 hover:underline">Upload new photo</button>
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    {[
                      { label: "Full name", key: "name" },
                      { label: "Email", key: "email" },
                      { label: "Phone", key: "phone" },
                      { label: "Role", key: "role" },
                    ].map((f) => (
                      <div key={f.key}>
                        <label className="text-xs font-semibold text-gray-700 mb-1.5 block">{f.label}</label>
                        <input
                          value={profile[f.key as keyof typeof profile]}
                          onChange={(e) => setProfile({ ...profile, [f.key]: e.target.value })}
                          className="w-full bg-white border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary transition-colors"
                        />
                      </div>
                    ))}
                    <div className="sm:col-span-2">
                      <label className="text-xs font-semibold text-gray-700 mb-1.5 block">Bio</label>
                      <textarea
                        value={profile.bio}
                        onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                        rows={3}
                        className="w-full bg-white border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary transition-colors resize-none"
                      />
                    </div>
                  </div>
                </>
              )}

              {tab === "notifications" && (
                <>
                  <h3 className="text-lg font-bold text-gray-900 mb-1">Notification preferences</h3>
                  <p className="text-sm text-gray-500 mb-4">Choose which notifications you want to receive.</p>
                  <Row title="Email notifications" desc="Job updates, comments, and mentions"><Toggle on={notif.email} onChange={() => setNotif({ ...notif, email: !notif.email })} /></Row>
                  <Row title="Push notifications" desc="Real-time alerts in the browser"><Toggle on={notif.push} onChange={() => setNotif({ ...notif, push: !notif.push })} /></Row>
                  <Row title="SMS notifications" desc="Critical alerts only"><Toggle on={notif.sms} onChange={() => setNotif({ ...notif, sms: !notif.sms })} /></Row>
                  <Row title="Weekly digest" desc="Performance summary every Monday"><Toggle on={notif.weekly} onChange={() => setNotif({ ...notif, weekly: !notif.weekly })} /></Row>
                  <Row title="@ mentions" desc="When someone tags you in chat"><Toggle on={notif.mentions} onChange={() => setNotif({ ...notif, mentions: !notif.mentions })} /></Row>
                </>
              )}

              {tab === "security" && (
                <>
                  <h3 className="text-lg font-bold text-gray-900 mb-1">Security & privacy</h3>
                  <p className="text-sm text-gray-500 mb-4">Manage your account security.</p>
                  <Row title="Two-factor authentication" desc="Require a code on every sign-in"><Toggle on={security.twoFA} onChange={() => setSecurity({ ...security, twoFA: !security.twoFA })} /></Row>
                  <Row title="New sign-in alerts" desc="Email me when a new device signs in"><Toggle on={security.sessionAlerts} onChange={() => setSecurity({ ...security, sessionAlerts: !security.sessionAlerts })} /></Row>
                  <div className="pt-6 mt-2 border-t border-gray-100">
                    <h4 className="text-sm font-bold text-gray-900 mb-3">Change password</h4>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <input type="password" placeholder="Current password" className="bg-white border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary" />
                      <input type="password" placeholder="New password" className="bg-white border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary" />
                    </div>
                  </div>
                </>
              )}

              {tab === "appearance" && (
                <>
                  <h3 className="text-lg font-bold text-gray-900 mb-1">Appearance</h3>
                  <p className="text-sm text-gray-500 mb-6">Customize how JobFlow looks to you.</p>

                  <div className="mb-6">
                    <div className="text-sm font-semibold text-gray-900 mb-3">Theme</div>
                    <div className="grid grid-cols-3 gap-3">
                      {["light", "dark", "system"].map((t) => (
                        <motion.button
                          key={t}
                          whileTap={{ scale: 0.97 }}
                          onClick={() => setAppearance({ ...appearance, theme: t })}
                          className={`relative p-4 rounded-xl border-2 transition-colors capitalize text-sm font-semibold ${appearance.theme === t ? "border-primary bg-primary/5 text-primary" : "border-gray-200 hover:border-gray-300 text-gray-700"}`}
                        >
                          {appearance.theme === t && (
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
                          onClick={() => setAppearance({ ...appearance, accent: c })}
                          className={`w-9 h-9 rounded-full border-2 flex items-center justify-center ${appearance.accent === c ? "border-gray-900" : "border-transparent"}`}
                          style={{ backgroundColor: c }}
                        >
                          {appearance.accent === c && <Check size={14} className="text-white" />}
                        </motion.button>
                      ))}
                    </div>
                  </div>

                  <Row title="Compact mode" desc="Reduce spacing and padding"><Toggle on={appearance.compact} onChange={() => setAppearance({ ...appearance, compact: !appearance.compact })} /></Row>
                </>
              )}

              {tab === "system" && (
                <>
                  <h3 className="text-lg font-bold text-gray-900 mb-1">System</h3>
                  <p className="text-sm text-gray-500 mb-4">Platform configuration and maintenance.</p>
                  <Row title="Auto-backup" desc="Daily database backup at 2:00 AM UTC"><Toggle on={true} onChange={() => {}} /></Row>
                  <Row title="Maintenance mode" desc="Temporarily disable user access"><Toggle on={false} onChange={() => {}} /></Row>
                  <Row title="API access logging" desc="Record all API requests"><Toggle on={true} onChange={() => {}} /></Row>
                  <div className="grid sm:grid-cols-3 gap-3 mt-6">
                    {[
                      { label: "Storage used", value: "47.2 GB", sub: "of 100 GB" },
                      { label: "API calls today", value: "12,408", sub: "+8.2% vs yesterday" },
                      { label: "Active users", value: "243", sub: "live now" },
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
                      { label: "Language", options: ["English (US)", "English (UK)", "Spanish", "French", "German"] },
                      { label: "Time zone", options: ["UTC", "America/New_York", "America/Los_Angeles", "Europe/London", "Asia/Singapore"] },
                      { label: "Date format", options: ["MM/DD/YYYY", "DD/MM/YYYY", "YYYY-MM-DD"] },
                      { label: "Currency", options: ["USD ($)", "EUR (€)", "GBP (£)", "JPY (¥)"] },
                    ].map((f) => (
                      <div key={f.label}>
                        <label className="text-xs font-semibold text-gray-700 mb-1.5 block">{f.label}</label>
                        <select className="w-full bg-white border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary transition-colors">
                          {f.options.map((o) => <option key={o}>{o}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Save bar */}
              <div className="flex items-center justify-end gap-3 mt-8 pt-6 border-t border-gray-100">
                <button className="px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-100 rounded-xl transition-colors">Cancel</button>
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={save}
                  className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm font-semibold shadow-md shadow-primary/30"
                >
                  <AnimatePresence mode="wait">
                    {saved ? (
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
