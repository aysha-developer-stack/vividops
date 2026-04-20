export type Role = "super_admin" | "admin" | "supervisor" | "user";

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  supervisor: "Supervisor",
  user: "User",
};

export const ROLE_REDIRECT: Record<Role, string> = {
  super_admin: "/super-admin",
  admin: "/admin",
  supervisor: "/supervisor",
  user: "/user",
};

const STORAGE_KEY = "jobflow_role";
const NAME_KEY = "jobflow_name";

export function setSession(role: Role, name = "Alex Morgan") {
  sessionStorage.setItem(STORAGE_KEY, role);
  sessionStorage.setItem(NAME_KEY, name);
}

export function getRole(): Role | null {
  return (sessionStorage.getItem(STORAGE_KEY) as Role | null) ?? null;
}

export function getName(): string {
  return sessionStorage.getItem(NAME_KEY) ?? "Alex Morgan";
}

export function clearSession() {
  sessionStorage.removeItem(STORAGE_KEY);
  sessionStorage.removeItem(NAME_KEY);
}
