import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db, sessions, users, type UserRow } from "@workspace/db";
import { SESSION_COOKIE } from "../lib/auth";
import { touchUserLastSeen } from "../lib/presence";

export interface SessionContext {
  sessionId: string;
  user: UserRow;
}

const sessionCache = new Map<
  string,
  { cacheUntilMs: number; value: SessionContext }
>();
export function updateSessionCacheUser(sessionId: string, user: UserRow) {
  const value = { sessionId, user };
  sessionCache.set(sessionId, { cacheUntilMs: Date.now() + 30_000, value });
}

export function clearSessionCache(sessionId: string) {
  sessionCache.delete(sessionId);
}

function sessionIdPreview(sessionId: string): string {
  return sessionId.slice(0, 8);
}

function parseSessionIdFromCookieHeader(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [rawKey, ...rest] = part.trim().split("=");
    if (rawKey === SESSION_COOKIE && rest.length > 0) {
      return decodeURIComponent(rest.join("="));
    }
  }
  return null;
}

/** Resolve an authenticated session from a cookie header or session id. */
export async function loadSessionContext(
  sessionIdOrCookieHeader: string,
  opts?: { fromCookieHeader?: boolean },
): Promise<SessionContext | null> {
  const sid = opts?.fromCookieHeader
    ? parseSessionIdFromCookieHeader(sessionIdOrCookieHeader)
    : sessionIdOrCookieHeader;
  if (!sid) return null;

  const cached = sessionCache.get(sid);
  if (cached && cached.cacheUntilMs > Date.now()) {
    return cached.value;
  }
  if (cached) {
    sessionCache.delete(sid);
  }

  try {
    const rows = await db
      .select({ session: sessions, user: users })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(eq(sessions.id, sid))
      .limit(1);

    const row = rows[0];
    if (!row) {
      sessionCache.delete(sid);
      return null;
    }

    if (row.session.expiresAt.getTime() < Date.now()) {
      await db.delete(sessions).where(eq(sessions.id, sid));
      sessionCache.delete(sid);
      return null;
    }
    if (row.user.status !== "active") {
      sessionCache.delete(sid);
      return null;
    }

    const value = { sessionId: sid, user: row.user };
    const cacheUntilMs = Math.min(row.session.expiresAt.getTime(), Date.now() + 30_000);
    sessionCache.set(sid, { cacheUntilMs, value });
    return value;
  } catch {
    return null;
  }
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      session?: SessionContext;
    }
  }
}

export async function attachSession(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const sid = req.cookies?.[SESSION_COOKIE];
  if (!sid || typeof sid !== "string") {
    return next();
  }

  try {
    const value = await loadSessionContext(sid);
    if (!value) {
      req.log.warn(
        { sessionIdPrefix: sessionIdPreview(sid) },
        "Session cookie did not match an active session",
      );
      return next();
    }
    req.session = value;
    touchUserLastSeen(value.user.id);
  } catch (err) {
    req.log.error(
      { err, sessionIdPrefix: sessionIdPreview(sid) },
      "Failed to load session",
    );
  }
  return next();
}
