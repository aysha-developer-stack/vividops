import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db, sessions, users, type UserRow } from "@workspace/db";
import { SESSION_COOKIE } from "../lib/auth";

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

  const cached = sessionCache.get(sid);
  if (cached && cached.cacheUntilMs > Date.now()) {
    req.session = cached.value;
    return next();
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
      req.log.warn(
        { sessionIdPrefix: sessionIdPreview(sid) },
        "Session cookie did not match an active session",
      );
      sessionCache.delete(sid);
      return next();
    }

    if (row.session.expiresAt.getTime() < Date.now()) {
      // Expired — delete and ignore.
      req.log.warn(
        {
          sessionIdPrefix: sessionIdPreview(sid),
          expiredAt: row.session.expiresAt.toISOString(),
        },
        "Session expired",
      );
      await db.delete(sessions).where(eq(sessions.id, sid));
      sessionCache.delete(sid);
      return next();
    }
    if (row.user.status !== "active") {
      req.log.warn(
        {
          sessionIdPrefix: sessionIdPreview(sid),
          userId: row.user.id,
          userStatus: row.user.status,
        },
        "Session rejected because user is inactive",
      );
      sessionCache.delete(sid);
      return next();
    }
    const value = { sessionId: sid, user: row.user };
    req.session = value;
    const cacheUntilMs = Math.min(
      row.session.expiresAt.getTime(),
      Date.now() + 30_000,
    );
    sessionCache.set(sid, { cacheUntilMs, value });
  } catch (err) {
    req.log.error(
      { err, sessionIdPrefix: sessionIdPreview(sid) },
      "Failed to load session",
    );
  }
  return next();
}
