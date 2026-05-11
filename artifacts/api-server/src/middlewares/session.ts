import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db, sessions, users, type UserRow } from "@workspace/db";
import { SESSION_COOKIE } from "../lib/auth";

export interface SessionContext {
  sessionId: string;
  user: UserRow;
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
    const rows = await db
      .select({ session: sessions, user: users })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(eq(sessions.id, sid))
      .limit(1);

    const row = rows[0];
    if (!row) return next();

    if (row.session.expiresAt.getTime() < Date.now()) {
      // Expired — delete and ignore.
      await db.delete(sessions).where(eq(sessions.id, sid));
      return next();
    }
    if (row.user.status !== "active") {
      return next();
    }
    req.session = { sessionId: sid, user: row.user };
  } catch (err) {
    req.log.error({ err }, "Failed to load session");
  }
  return next();
}
