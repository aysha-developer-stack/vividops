import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, XCircle, Shield, Crown, HardHat, User as UserIcon, Save } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";

type RoleKey = "super-admin" | "admin" | "supervisor" | "user";

type PermissionKey =
  | "users.manage"
  | "users.roles"
  | "jobs.manage"
  | "jobs.assign"
  | "jobs.monitor"
  | "timers.monitor"
  | "reports.all"
  | "reports.errors"
  | "training.manage"
  | "communication.monitor"
  | "files.manage"
  | "system.monitor"
  | "settings.manage";

const ROLE_LABEL: Record<RoleKey, { label: string; icon: any; badge: string }> = {
  "super-admin": { label: "Super Admin", icon: Crown, badge: "bg-amber-50 text-amber-700 border-amber-200" },
  admin: { label: "Admin", icon: Shield, badge: "bg-primary/10 text-primary border-primary/20" },
  supervisor: { label: "Supervisor", icon: HardHat, badge: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  user: { label: "User", icon: UserIcon, badge: "bg-gray-50 text-gray-700 border-gray-200" },
};

const PERMISSIONS: { key: PermissionKey; label: string; desc: string }[] = [
  { key: "users.manage", label: "User Management", desc: "Create, edit, delete, activate/deactivate users, reset passwords" },
  { key: "users.roles", label: "Roles & Permissions", desc: "Assign roles and configure permissions" },
  { key: "jobs.manage", label: "Job Management", desc: "Create, edit, delete jobs, mark complete" },
  { key: "jobs.assign", label: "Assignments", desc: "Assign and reassign users to jobs" },
  { key: "jobs.monitor", label: "Job Monitoring", desc: "View all job progress, due dates, and job activity" },
  { key: "timers.monitor", label: "Timer Monitoring", desc: "Monitor timers and activity across users" },
  { key: "reports.all", label: "Reports & Analytics", desc: "Progress, time, productivity across all users" },
  { key: "reports.errors", label: "Error Reports", desc: "View rework count, supervisor comments, mistakes/errors" },
  { key: "training.manage", label: "Training Management", desc: "Create training updates and track completion" },
  { key: "communication.monitor", label: "Communication Monitoring", desc: "Monitor job discussions and integration status" },
  { key: "files.manage", label: "Files Management", desc: "View/download/delete job and completed files" },
  { key: "system.monitor", label: "System Monitoring", desc: "View online users, activity, system health" },
  { key: "settings.manage", label: "Settings", desc: "Company settings, notifications and integrations" },
];

const DEFAULT_MATRIX: Record<RoleKey, Record<PermissionKey, boolean>> = {
  "super-admin": Object.fromEntries(PERMISSIONS.map((p) => [p.key, true])) as Record<PermissionKey, boolean>,
  admin: {
    "users.manage": true,
    "users.roles": false,
    "jobs.manage": true,
    "jobs.assign": true,
    "jobs.monitor": true,
    "timers.monitor": true,
    "reports.all": true,
    "reports.errors": true,
    "training.manage": true,
    "communication.monitor": true,
    "files.manage": true,
    "system.monitor": false,
    "settings.manage": true,
  },
  supervisor: {
    "users.manage": false,
    "users.roles": false,
    "jobs.manage": false,
    "jobs.assign": true,
    "jobs.monitor": true,
    "timers.monitor": true,
    "reports.all": true,
    "reports.errors": true,
    "training.manage": true,
    "communication.monitor": true,
    "files.manage": true,
    "system.monitor": false,
    "settings.manage": false,
  },
  user: {
    "users.manage": false,
    "users.roles": false,
    "jobs.manage": false,
    "jobs.assign": false,
    "jobs.monitor": false,
    "timers.monitor": false,
    "reports.all": false,
    "reports.errors": false,
    "training.manage": true,
    "communication.monitor": false,
    "files.manage": true,
    "system.monitor": false,
    "settings.manage": false,
  },
};

export default function SuperAdminRolesPermissions() {
  const [matrix, setMatrix] = useState(DEFAULT_MATRIX);
  const roles: RoleKey[] = useMemo(() => ["super-admin", "admin", "supervisor", "user"], []);

  return (
    <DashboardLayout title="Roles & Permissions" role="super-admin">
      <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-6">
        <div className="flex flex-col md:flex-row gap-4 md:items-center md:justify-between">
          <div>
            <div className="text-sm font-bold text-gray-900">Access Matrix</div>
            <div className="text-xs text-gray-500 mt-1">Configure what each role can see and do across the platform</div>
          </div>
          <button className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-bold shadow-md shadow-primary/30">
            <Save size={14} /> Save Changes
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-6 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Permission</th>
                {roles.map((r) => {
                  const cfg = ROLE_LABEL[r];
                  const Icon = cfg.icon;
                  return (
                    <th key={r} className="text-left px-6 py-3">
                      <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border ${cfg.badge}`}>
                        <Icon size={14} />
                        <span className="text-[11px] font-bold uppercase tracking-wider">{cfg.label}</span>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {PERMISSIONS.map((p, i) => (
                <motion.tr
                  key={p.key}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.02 }}
                  className="hover:bg-gray-50/50"
                >
                  <td className="px-6 py-4">
                    <div className="text-sm font-semibold text-gray-900">{p.label}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{p.desc}</div>
                  </td>
                  {roles.map((r) => {
                    const enabled = matrix[r][p.key];
                    return (
                      <td key={`${r}-${p.key}`} className="px-6 py-4">
                        <button
                          onClick={() => {
                            setMatrix((prev) => ({
                              ...prev,
                              [r]: { ...prev[r], [p.key]: !prev[r][p.key] },
                            }));
                          }}
                          className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold transition-colors ${
                            enabled
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                              : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
                          }`}
                        >
                          {enabled ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                          {enabled ? "Allowed" : "Blocked"}
                        </button>
                      </td>
                    );
                  })}
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardLayout>
  );
}
