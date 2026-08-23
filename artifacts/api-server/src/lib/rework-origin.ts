import type { UserRow } from "@workspace/db";

export type ReworkOrigin = "internal" | "external";

export function isReworkOrigin(value: unknown): value is ReworkOrigin {
  return value === "internal" || value === "external";
}

/** Admin/super-admin must pick internal vs external; supervisors use default (null). */
export function resolveReworkOriginForActor(
  actor: UserRow,
  raw: unknown,
): { origin: ReworkOrigin | null; error: string | null } {
  const isAdmin = actor.role === "admin" || actor.role === "super-admin";
  if (!isAdmin) {
    return { origin: null, error: null };
  }
  if (!isReworkOrigin(raw)) {
    return {
      origin: null,
      error: "Select Internal Rework or External Rework before submitting.",
    };
  }
  return { origin: raw, error: null };
}

export function reworkOriginLabel(origin: string | null | undefined): string | null {
  if (origin === "internal") return "Internal rework";
  if (origin === "external") return "External rework";
  return null;
}
