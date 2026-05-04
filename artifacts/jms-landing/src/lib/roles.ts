import {
  LayoutDashboard, Briefcase, Users, BarChart3, MessageCircle,
  Timer, GraduationCap, Settings, Crown, Shield, HardHat, User as UserIcon,
  Activity, ClipboardList, Eye, FileText,
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
    portal: "Admin Portal",
    icon: Crown,
    base: "/super-admin",
    nav: [
      { label: "Dashboard", icon: LayoutDashboard, path: "/super-admin" },
      { label: "User Management", icon: Users, path: "/super-admin/users" },
      { label: "Job Overview", icon: Briefcase, path: "/super-admin/jobs" },
      { label: "System Monitoring", icon: Activity, path: "/super-admin/monitoring" },
      { label: "Reports", icon: BarChart3, path: "/super-admin/reports" },
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
      { label: "Jobs", icon: Briefcase, path: "/admin/jobs" },
      { label: "Users", icon: Users, path: "/admin/users" },
      { label: "Reports", icon: BarChart3, path: "/admin/reports" },
      { label: "Supervisor Monitoring", icon: Eye, path: "/admin/supervisors" },
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
      { label: "User Monitoring", icon: Activity, path: "/supervisor/users" },
      { label: "Reports", icon: BarChart3, path: "/supervisor/reports" },
      { label: "Communication", icon: MessageCircle, path: "/supervisor/communication" },
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
      { label: "My Reports", icon: FileText, path: "/user/reports" },
      { label: "Training", icon: GraduationCap, path: "/user/training" },
      { label: "Communication", icon: MessageCircle, path: "/user/communication" },
    ],
  },
};
