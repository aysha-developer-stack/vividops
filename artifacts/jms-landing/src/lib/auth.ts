import type { Role } from "@/lib/roles";

const NAME_KEY = "jobflow_name";
const EMAIL_KEY = "jobflow_email";
const ROLE_KEY = "jobflow_role";

export function setSession(email: string, name = "Alex Morgan", role: Role = "super-admin") {
  sessionStorage.setItem(EMAIL_KEY, email);
  sessionStorage.setItem(NAME_KEY, name);
  sessionStorage.setItem(ROLE_KEY, role);
}

export function getName(): string {
  return sessionStorage.getItem(NAME_KEY) ?? "Alex Morgan";
}

export function getEmail(): string {
  return sessionStorage.getItem(EMAIL_KEY) ?? "admin@vividops.com.au";
}

export function getRole(): Role {
  return (sessionStorage.getItem(ROLE_KEY) as Role) ?? "super-admin";
}

export function clearSession() {
  sessionStorage.removeItem(EMAIL_KEY);
  sessionStorage.removeItem(NAME_KEY);
  sessionStorage.removeItem(ROLE_KEY);
}
