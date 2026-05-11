import type { UserRow } from "@workspace/db";

export function publicUser(u: UserRow) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    status: u.status,
    mustResetPassword: u.mustResetPassword,
    lastSignInAt: u.lastSignInAt ? u.lastSignInAt.toISOString() : null,
    createdAt: u.createdAt.toISOString(),
  };
}
