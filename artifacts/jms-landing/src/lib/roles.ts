import {
  LayoutDashboard, Briefcase, Users, BarChart3, MessageCircle,
  Timer, GraduationCap, Settings, Crown, Shield, HardHat, User as UserIcon,
  Activity, ClipboardList, Eye, FileText, AlertTriangle, Folder, CheckSquare, Bell, ListChecks,
} from "lucide-react";

export type Role = "super-admin" | "admin" | "supervisor" | "user";

export interface NavItem {
  label: string;
  icon: any;
  path: string;
}

export interface RoleConfig {
  label: string;
  portal: string;
  icon: any;
  base: string;
  nav: NavItem[];
}

export const ROLES: Record<Role, RoleConfig> = {
  "super-admin": {
    label: "Super Admin",
    portal: "Super Admin Portal",
    icon: Crown,
    base: "/super-admin",
    nav: [
      { label: "Dashboard", icon: LayoutDashboard, path: "/super-admin" },
      { label: "Users", icon: Users, path: "/super-admin/users" },
      { label: "Jobs", icon: Briefcase, path: "/super-admin/jobs" },
      { label: "Reports", icon: BarChart3, path: "/super-admin/reports" },
      { label: "System Monitoring", icon: Activity, path: "/super-admin/monitoring" },
      { label: "Training", icon: GraduationCap, path: "/super-admin/training" },
      { label: "Communication", icon: MessageCircle, path: "/super-admin/communication" },
      { label: "Files", icon: Folder, path: "/super-admin/files" },
      { label: "Notifications", icon: Bell, path: "/super-admin/notifications" },
      { label: "Settings", icon: Settings, path: "/super-admin/settings" },
    ],
  },
  admin: {
    label: "Admin",
    portal: "Admin Portal",
    icon: Shield,
    base: "/admin",
    nav: [
      { label: "Dashboard", icon: LayoutDashboard, path: "/admin" },
      { label: "Users", icon: Users, path: "/admin/users" },
      { label: "Jobs", icon: Briefcase, path: "/admin/jobs" },
      { label: "Monitoring", icon: Eye, path: "/admin/monitoring" },
      { label: "Reports", icon: BarChart3, path: "/admin/reports" },
      { label: "Training", icon: GraduationCap, path: "/admin/training" },
      { label: "Communication", icon: MessageCircle, path: "/admin/communication" },
      { label: "Files", icon: Folder, path: "/admin/files" },
      { label: "Settings", icon: Settings, path: "/admin/settings" },
    ],
  },
  supervisor: {
    label: "Supervisor",
    portal: "Supervisor Portal",
    icon: HardHat,
    base: "/supervisor",
    nav: [
      { label: "Dashboard", icon: LayoutDashboard, path: "/supervisor" },
      { label: "Jobs", icon: Briefcase, path: "/supervisor/jobs" },
      { label: "Users", icon: Users, path: "/supervisor/users" },
      { label: "Communication", icon: MessageCircle, path: "/supervisor/communication" },
      { label: "Reports", icon: BarChart3, path: "/supervisor/reports" },
      { label: "Training", icon: GraduationCap, path: "/supervisor/training" },
      { label: "Notifications", icon: Bell, path: "/supervisor/notifications" },
      { label: "Settings", icon: Settings, path: "/supervisor/settings" },
    ],
  },
  user: {
    label: "Field User",
    portal: "Worker Portal",
    icon: UserIcon,
    base: "/user",
    nav: [
      { label: "Dashboard", icon: LayoutDashboard, path: "/user" },
      { label: "My Jobs", icon: ClipboardList, path: "/user/jobs" },
      { label: "Timer", icon: Timer, path: "/user/timer" },
      { label: "Communication", icon: MessageCircle, path: "/user/communication" },
      { label: "Files & Checklists", icon: Folder, path: "/user/files" },
      { label: "My Reports", icon: BarChart3, path: "/user/reports" },
      { label: "Training", icon: GraduationCap, path: "/user/training" },
      { label: "Notifications", icon: Bell, path: "/user/notifications" },
      { label: "Settings", icon: Settings, path: "/user/settings" },
    ],
  },
};
