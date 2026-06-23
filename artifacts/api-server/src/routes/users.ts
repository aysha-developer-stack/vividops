import { Router, type IRouter, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, sessions, users, type UserRow } from "@workspace/db";
import { CreateUserBody, UpdateUserBody } from "@workspace/api-zod";
import { generateTempPassword, hashPassword } from "../lib/auth";
import { publicUser } from "../lib/serialize";
import { requireRole } from "../middlewares/requireAuth";
import { sendInviteEmail } from "../lib/email";

const router: IRouter = Router();

const adminOnly = requireRole("super-admin", "admin");
const listUsersAllowed = requireRole("super-admin", "admin", "supervisor");

// Returns active users + supervisors that any signed-in user can pick when
// assigning a job. Defined BEFORE /users/:id so the literal path wins over
// the parameterized route.
router.get("/users/assignable", async (req, res) => {
  if (!req.session) return res.status(401).json({ error: "Not signed in" });
  const rows = await db
    .select({ id: users.id, name: users.name, role: users.role })
    .from(users)
    .where(eq(users.status, "active"))
    .orderBy(users.name);
  const assignable = rows.filter(
    (u) => u.role === "user" || u.role === "supervisor",
  );
  return res.json(assignable);
});

/**
 * Returns true if the actor is allowed to manage / view the target user.
 * Super-admins can manage anyone. Admins can only manage supervisor + user.
 * If denied, writes a 403 response and returns false.
 */
function assertCanManage(actor: UserRow, target: UserRow, res: Response): boolean {
  if (actor.role === "super-admin") return true;
  if (actor.role === "admin" && (target.role === "supervisor" || target.role === "user")) {
    return true;
  }
  res.status(403).json({ error: "You do not have permission to manage this user" });
  return false;
}

function buildSignInUrl(req?: any): string {
  const explicit =
    process.env.PUBLIC_APP_URL ??
    process.env.APP_URL ??
    process.env.FRONTEND_URL ??
    "";
  if (explicit) {
    const base = explicit.replace(/\/+$/, "");
    return `${base}/login`;
  }

  // If running on Railway/Production, try to detect the host from the request
  if (req && req.get) {
    const host = req.get("x-forwarded-host") || req.get("host");
    const protocol = req.get("x-forwarded-proto") || req.protocol || "https";
    if (host && !host.includes("localhost") && !host.includes("127.0.0.1")) {
      return `${protocol}://${host}/login`;
    }
  }

  const domains = process.env.REPLIT_DOMAINS?.split(",").map((s) => s.trim());
  const host = domains?.[0];
  if (host) return `https://${host}/login`;
  
  // FINAL FALLBACK for your specific domain if detection fails
  if (process.env.NODE_ENV === "production") {
    return "https://vividops.com.au/login";
  }

  return "http://localhost:5173/login";
}

router.get("/users", listUsersAllowed, async (req, res) => {
  const actor = req.session!.user;
  const rows = await db.select().from(users).orderBy(users.createdAt);

  const visible =
    actor.role === "super-admin"
      ? rows
      : actor.role === "admin"
        ? rows.filter((u) => u.role === "supervisor" || u.role === "user")
        : rows.filter((u) => u.role === "user");

  return res.json(visible.map(publicUser));
});

router.post("/users", adminOnly, async (req, res) => {
  const parsed = CreateUserBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid user data" });
  }
  const { name, email, role, delivery } = parsed.data;
  const actor = req.session!.user;

  if (actor.role === "admin" && (role === "super-admin" || role === "admin")) {
    return res
      .status(403)
      .json({ error: "Admins can only create supervisor or user accounts" });
  }

  const normalizedEmail = email.toLowerCase();
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);
  if (existing) {
    return res.status(409).json({ error: "A user with that email already exists" });
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);
  const [created] = await db
    .insert(users)
    .values({
      name,
      email: normalizedEmail,
      role,
      passwordHash,
      mustResetPassword: true,
    })
    .returning();

  let emailSent: boolean | null = null;
  let emailError: string | null = null;
  if (delivery === "email-invite") {
    const result = await sendInviteEmail({
      to: created.email,
      name: created.name,
      tempPassword,
      signInUrl: buildSignInUrl(req),
    });
    emailSent = result.sent;
    emailError = result.sent ? null : result.error ?? "Failed to send email";
  }

  return res.status(201).json({
    user: publicUser(created),
    delivery,
    tempPassword: delivery === "temp-password" ? tempPassword : null,
    emailSent,
    emailError,
  });
});

router.get("/users/:id", adminOnly, async (req, res) => {
  const id = req.params.id as string;
  const actor = req.session!.user;
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!user) return res.status(404).json({ error: "User not found" });
  if (!assertCanManage(actor, user, res)) return;
  return res.json(publicUser(user));
});

router.patch("/users/:id", adminOnly, async (req, res) => {
  const parsed = UpdateUserBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid user data" });
  }
  const actor = req.session!.user;
  const id = req.params.id as string;

  const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!target) return res.status(404).json({ error: "User not found" });
  if (!assertCanManage(actor, target, res)) return;

  if (actor.role === "admin" && parsed.data.role && parsed.data.role !== "supervisor" && parsed.data.role !== "user") {
    return res.status(403).json({ error: "Admins can only assign supervisor or user roles" });
  }

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if (parsed.data.email !== undefined) patch.email = parsed.data.email.toLowerCase();
  if (parsed.data.phone !== undefined) patch.phone = parsed.data.phone;
  if (parsed.data.bio !== undefined) patch.bio = parsed.data.bio;
  if (parsed.data.role !== undefined) patch.role = parsed.data.role;
  if (parsed.data.status !== undefined) patch.status = parsed.data.status;

  const [updated] = await db
    .update(users)
    .set(patch)
    .where(eq(users.id, id))
    .returning();
  return res.json(publicUser(updated));
});

router.delete("/users/:id", adminOnly, async (req, res) => {
  const actor = req.session!.user;
  const id = req.params.id as string;
  if (id === actor.id) {
    return res.status(400).json({ error: "You cannot delete your own account" });
  }
  const [target] = await db
    .select()
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!target) return res.status(404).json({ error: "User not found" });
  if (!assertCanManage(actor, target, res)) return;
  try {
    await db.delete(users).where(eq(users.id, id));
    return res.status(204).end();
  } catch (err) {
    const anyErr = err as any;
    const code =
      anyErr?.code ??
      anyErr?.cause?.code ??
      anyErr?.cause?.cause?.code ??
      anyErr?.originalError?.code ??
      anyErr?.meta?.cause?.code;
    const message = typeof anyErr?.message === "string" ? anyErr.message : "";

    if (code === "23503" || message.toLowerCase().includes("foreign key")) {
      return res.status(409).json({
        error:
          "Cannot delete this user because they have related records (e.g., uploaded files, checklists, logs, or job links). Set the user status to Inactive instead.",
      });
    }
    return res.status(500).json({ error: "Failed to delete user" });
  }
});

router.post("/users/:id/resend-invite", adminOnly, async (req, res) => {
  const id = req.params.id as string;
  const actor = req.session!.user;
  const [target] = await db
    .select()
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!target) return res.status(404).json({ error: "User not found" });
  if (!assertCanManage(actor, target, res)) return;

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);
  const [updated] = await db
    .update(users)
    .set({ passwordHash, mustResetPassword: true, updatedAt: new Date() })
    .where(eq(users.id, target.id))
    .returning();

  // Credentials changed — invalidate every existing session for this user.
  await db.delete(sessions).where(eq(sessions.userId, target.id));

  const result = await sendInviteEmail({
    to: updated.email,
    name: updated.name,
    tempPassword,
    signInUrl: buildSignInUrl(req),
  });

  return res.json({
    user: publicUser(updated),
    delivery: "email-invite",
    tempPassword: null,
    emailSent: result.sent,
    emailError: result.sent ? null : result.error ?? "Failed to send email",
  });
});

export default router;
