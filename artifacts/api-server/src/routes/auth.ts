import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, sessions, users } from "@workspace/db";
import { LoginBody, ResetPasswordBody } from "@workspace/api-zod";
import {
  SESSION_COOKIE,
  SESSION_TTL_DAYS,
  hashPassword,
  sessionExpiresAt,
  verifyPassword,
} from "../lib/auth";
import { publicUser } from "../lib/serialize";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

const cookieOpts = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
};

router.post("/auth/login", async (req, res) => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid email or password" });
  }
  const { email, password } = parsed.data;

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);

  if (!user || user.status !== "active") {
    return res.status(401).json({ error: "Invalid email or password" });
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const [session] = await db
    .insert(sessions)
    .values({ userId: user.id, expiresAt: sessionExpiresAt() })
    .returning();

  await db
    .update(users)
    .set({ lastSignInAt: new Date() })
    .where(eq(users.id, user.id));

  res.cookie(SESSION_COOKIE, session.id, cookieOpts);
  return res.json({ user: publicUser({ ...user, lastSignInAt: new Date() }) });
});

router.post("/auth/logout", async (req, res) => {
  const sid = req.cookies?.[SESSION_COOKIE];
  if (sid && typeof sid === "string") {
    await db.delete(sessions).where(eq(sessions.id, sid));
  }
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  return res.status(204).end();
});

router.get("/auth/me", requireAuth, (req, res) => {
  return res.json(publicUser(req.session!.user));
});

router.post("/auth/reset-password", requireAuth, async (req, res) => {
  const parsed = ResetPasswordBody.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: "New password must be at least 8 characters" });
  }
  const { currentPassword, newPassword } = parsed.data;
  const user = req.session!.user;

  const ok = await verifyPassword(currentPassword, user.passwordHash);
  if (!ok) {
    return res.status(401).json({ error: "Current password is incorrect" });
  }

  const passwordHash = await hashPassword(newPassword);
  const [updated] = await db
    .update(users)
    .set({
      passwordHash,
      mustResetPassword: false,
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id))
    .returning();

  return res.json(publicUser(updated));
});

export default router;
