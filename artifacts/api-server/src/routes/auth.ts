import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db, sessions, users, sql } from "@workspace/db";
import { LoginBody, ResetPasswordBody, UpdateUserBody } from "@workspace/api-zod";
import { logger } from "../lib/logger";
import { upload, uploadToSupabase } from "../lib/storage";
import {
  SESSION_COOKIE,
  hashPassword,
  sessionExpiresAt,
  verifyPassword,
} from "../lib/auth";
import { publicUser } from "../lib/serialize";
import { requireAuth } from "../middlewares/requireAuth";
import { clearSessionCache, updateSessionCacheUser } from "../middlewares/session";
import { sendPasswordResetEmail } from "../lib/email";

const router: IRouter = Router();
let userColumnsEnsured = false;

async function ensureUserColumns() {
  if (userColumnsEnsured) return;
  userColumnsEnsured = true;
  await db.execute(sql`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS phone text,
      ADD COLUMN IF NOT EXISTS bio text,
      ADD COLUMN IF NOT EXISTS avatar_url text;
  `);
}

const cookieOpts = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

router.post("/auth/login", async (req, res) => {
  await ensureUserColumns();
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    logger.error({ errors: parsed.error.format() }, "Login validation failed");
    return res.status(400).json({ error: "Invalid email or password" });
  }
  const { email, password, role } = parsed.data;
  logger.info({ email, role }, "Login validation success");

  let user: typeof users.$inferSelect | undefined;
  try {
    [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);
  } catch (err) {
    logger.error({ err }, "Login failed: DB query error");
    return res.status(503).json({ error: "Database connection failed" });
  }

  if (!user) {
    logger.warn({ email }, "Login failed: User not found");
    return res.status(401).json({ error: "Invalid email or password" });
  }

  // Enforce role-based login
  if (user.role !== role) {
    logger.warn({ email, userRole: user.role, requestedRole: role }, "Login failed: Role mismatch");
    const roleLabel = role === "super-admin" ? "Super Admin" : role.charAt(0).toUpperCase() + role.slice(1);
    return res.status(401).json({ error: `This account does not have ${roleLabel} access` });
  }
  
  if (user.status !== "active") {
    logger.warn({ email, status: user.status }, "Login failed: User inactive");
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    logger.warn({ email }, "Login failed: Password mismatch");
    return res.status(401).json({ error: "Invalid email or password" });
  }

  let session: typeof sessions.$inferSelect;
  try {
    [session] = await db
      .insert(sessions)
      .values({ userId: user.id, expiresAt: sessionExpiresAt() })
      .returning();

    await db
      .update(users)
      .set({ lastSignInAt: new Date() })
      .where(eq(users.id, user.id));
  } catch (err) {
    logger.error({ err }, "Login failed: DB write error");
    return res.status(503).json({ error: "Database connection failed" });
  }

  res.cookie(SESSION_COOKIE, session.id, cookieOpts);
  return res.json({ user: publicUser({ ...user, lastSignInAt: new Date() }) });
});

router.post("/auth/logout", async (req, res) => {
  const sid = req.cookies?.[SESSION_COOKIE];
  if (sid && typeof sid === "string") {
    await db.delete(sessions).where(eq(sessions.id, sid));
    clearSessionCache(sid);
  }
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Clear-Site-Data", "\"cache\", \"storage\"");
  return res.status(204).end();
});

router.get("/auth/me", requireAuth, (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  return res.json(publicUser(req.session!.user));
});

router.patch("/auth/profile", requireAuth, async (req, res) => {
  await ensureUserColumns();
  const parsed = UpdateUserBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid profile data" });
  }
  const user = req.session!.user;

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if (parsed.data.email !== undefined) patch.email = parsed.data.email.toLowerCase();
  if (parsed.data.phone !== undefined) patch.phone = parsed.data.phone;
  if (parsed.data.bio !== undefined) patch.bio = parsed.data.bio;
  if (parsed.data.avatarUrl !== undefined) patch.avatarUrl = parsed.data.avatarUrl;

  // Normal users cannot change their role or status via this endpoint
  // That must be done by an admin via /api/users/:id

  const [updated] = await db
    .update(users)
    .set(patch)
    .where(eq(users.id, user.id))
    .returning();
  req.session!.user = updated;
  updateSessionCacheUser(req.session!.sessionId, updated);
  return res.json(publicUser(updated));
});

router.post("/auth/profile/avatar", requireAuth, upload.single("file"), async (req, res) => {
  await ensureUserColumns();
  const actor = req.session!.user;
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: "No file uploaded" });
  }
  if (!file.mimetype.startsWith("image/")) {
    return res.status(400).json({ error: "Only image files are allowed" });
  }

  const { location } = await uploadToSupabase(file, { prefix: `avatars/${actor.id}` });
  const [updated] = await db
    .update(users)
    .set({ avatarUrl: location, updatedAt: new Date() })
    .where(eq(users.id, actor.id))
    .returning();

  req.session!.user = updated;
  updateSessionCacheUser(req.session!.sessionId, updated);
  return res.json({ avatarUrl: updated.avatarUrl });
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

  // Revoke every other session for this user. Rotate the current session id so
  // the active browser keeps working but any stolen cookie is now useless.
  const currentSid = req.session!.sessionId;
  await db.delete(sessions).where(eq(sessions.userId, user.id));
  const [fresh] = await db
    .insert(sessions)
    .values({ userId: user.id, expiresAt: sessionExpiresAt() })
    .returning();
  res.cookie(SESSION_COOKIE, fresh.id, cookieOpts);
  void currentSid;

  return res.json(publicUser(updated));
});

router.post("/auth/forgot-password", async (req, res) => {
  const { email } = req.body;
  if (!email || typeof email !== "string") {
    return res.status(400).json({ error: "Email is required" });
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);

  if (!user) {
    // Return 200 even if user not found for security (prevent email enumeration)
    return res.json({ message: "If an account exists, a reset link has been sent." });
  }

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 3600000); // 1 hour

  await db.execute(sql`
    INSERT INTO password_reset_tokens (user_id, token, expires_at)
    VALUES (${user.id}, ${token}, ${expiresAt})
    ON CONFLICT (user_id) DO UPDATE
    SET token = EXCLUDED.token, expires_at = EXCLUDED.expires_at, created_at = now();
  `);

  const resetUrl = `${process.env.PUBLIC_APP_URL || "http://localhost:5173"}/reset-password?token=${token}`;
 
   const { sent, error } = await sendPasswordResetEmail({
     to: user.email,
     name: user.name,
     resetUrl
   });
 
   if (!sent) {
    logger.error({ email, error }, "Failed to send reset email");
    return res.status(500).json({ error: "Failed to send reset email" });
  }

  return res.json({ message: "If an account exists, a reset link has been sent." });
});

router.post("/auth/reset-password-with-token", async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: "Invalid token or password" });
  }

  const rows = await db.execute(sql`
    SELECT user_id FROM password_reset_tokens
    WHERE token = ${token} AND expires_at > now()
    LIMIT 1
  `);
  
  const resetToken = (rows as any).rows?.[0];
  if (!resetToken) {
    return res.status(400).json({ error: "Invalid or expired token" });
  }

  const [user] = await db.select().from(users).where(eq(users.id, resetToken.user_id)).limit(1);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  const passwordHash = await hashPassword(newPassword);
  await db.update(users)
    .set({ 
      passwordHash, 
      mustResetPassword: false,
      updatedAt: new Date()
    })
    .where(eq(users.id, resetToken.user_id));

  await db.execute(sql`DELETE FROM password_reset_tokens WHERE token = ${token}`);

  // Automatically log the user in after successful reset
  const [session] = await db
    .insert(sessions)
    .values({ userId: user.id, expiresAt: sessionExpiresAt() })
    .returning();

  res.cookie(SESSION_COOKIE, session.id, cookieOpts);
  
  return res.json({ 
    message: "Password has been reset successfully.",
    user: publicUser(user)
  });
});

export default router;
