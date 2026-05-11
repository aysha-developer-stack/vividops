import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, users } from "@workspace/db";
import { CreateUserBody, UpdateUserBody } from "@workspace/api-zod";
import { generateTempPassword, hashPassword } from "../lib/auth";
import { publicUser } from "../lib/serialize";
import { requireRole } from "../middlewares/requireAuth";
import { sendInviteEmail } from "../lib/email";

const router: IRouter = Router();

const adminOnly = requireRole("super-admin", "admin");

function buildSignInUrl(): string {
  const domains = process.env.REPLIT_DOMAINS?.split(",").map((s) => s.trim());
  const host = domains?.[0];
  if (host) return `https://${host}/login`;
  return "/login";
}

router.get("/users", adminOnly, async (req, res) => {
  const actor = req.session!.user;
  const rows = await db.select().from(users).orderBy(users.createdAt);

  // Admins cannot see super-admins or other admins (per existing UI rule:
  // Admin manages Supervisor + User only).
  const visible =
    actor.role === "super-admin"
      ? rows
      : rows.filter((u) => u.role === "supervisor" || u.role === "user");

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
  if (delivery === "email-invite") {
    const result = await sendInviteEmail({
      to: created.email,
      name: created.name,
      tempPassword,
      signInUrl: buildSignInUrl(),
    });
    emailSent = result.sent;
  }

  return res.status(201).json({
    user: publicUser(created),
    delivery,
    tempPassword: delivery === "temp-password" ? tempPassword : null,
    emailSent,
  });
});

router.get("/users/:id", adminOnly, async (req, res) => {
  const id = req.params.id as string;
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!user) return res.status(404).json({ error: "User not found" });
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

  if (actor.role === "admin") {
    if (target.role === "super-admin" || target.role === "admin") {
      return res.status(403).json({ error: "Admins cannot modify admin accounts" });
    }
    if (parsed.data.role === "super-admin" || parsed.data.role === "admin") {
      return res.status(403).json({ error: "Admins cannot promote to admin" });
    }
  }

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if (parsed.data.email !== undefined) patch.email = parsed.data.email.toLowerCase();
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
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!target) return res.status(404).json({ error: "User not found" });
  if (
    actor.role === "admin" &&
    (target.role === "super-admin" || target.role === "admin")
  ) {
    return res.status(403).json({ error: "Admins cannot delete admin accounts" });
  }
  await db.delete(users).where(eq(users.id, id));
  return res.status(204).end();
});

router.post("/users/:id/resend-invite", adminOnly, async (req, res) => {
  const id = req.params.id as string;
  const [target] = await db
    .select()
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!target) return res.status(404).json({ error: "User not found" });

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);
  const [updated] = await db
    .update(users)
    .set({ passwordHash, mustResetPassword: true, updatedAt: new Date() })
    .where(eq(users.id, target.id))
    .returning();

  const result = await sendInviteEmail({
    to: updated.email,
    name: updated.name,
    tempPassword,
    signInUrl: buildSignInUrl(),
  });

  return res.json({
    user: publicUser(updated),
    delivery: "email-invite",
    tempPassword: null,
    emailSent: result.sent,
  });
});

export default router;
