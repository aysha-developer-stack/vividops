import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, twoFactorChallenges, users } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/requireAuth";
import { logger } from "../lib/logger";
import { publicUser } from "../lib/serialize";
import { ensureTwoFactorSchema } from "../lib/schema-init";
import { completeLoginSession } from "./auth";
import {
  decryptSecret,
  encryptSecret,
  generateTotpSecret,
  totpOtpauthUrl,
  verifyTotpCode,
} from "../lib/totp";
import {
  bumpChallengeAttempts,
  consumeChallenge,
  isTwoFactorEnrolled,
  loadValidChallenge,
  persistEnrollment,
  rememberTrustedDevice,
  replaceBackupCodes,
  resetUserTwoFactor,
  verifyUserTotp,
  consumeUserBackupCode,
} from "../lib/two-factor";

const router: IRouter = Router();

function readToken(body: unknown): string {
  const token = (body as { challengeToken?: unknown })?.challengeToken;
  return typeof token === "string" ? token.trim() : "";
}

function readCode(body: unknown): string {
  const code = (body as { code?: unknown })?.code;
  return typeof code === "string" ? code.trim() : "";
}

function rememberRequested(body: unknown): boolean {
  return (body as { rememberDevice?: unknown })?.rememberDevice === true;
}

router.post("/auth/2fa/enroll-start", async (req, res) => {
  try {
    await ensureTwoFactorSchema();
    const challenge = await loadValidChallenge(readToken(req.body));
    if (!challenge) return res.status(401).json({ error: "Verification expired. Please sign in again." });

    const [user] = await db.select().from(users).where(eq(users.id, challenge.userId)).limit(1);
    if (!user || user.status !== "active") {
      return res.status(401).json({ error: "Verification expired. Please sign in again." });
    }
    if (isTwoFactorEnrolled(user)) {
      return res.status(400).json({ error: "Two-factor authentication is already set up." });
    }

    const secret = generateTotpSecret();
    await db
      .update(twoFactorChallenges)
      .set({ pendingTotpSecret: encryptSecret(secret) })
      .where(eq(twoFactorChallenges.id, challenge.id));

    return res.json({
      secret,
      otpauthUrl: totpOtpauthUrl(user.email, secret),
      maskedEmail: user.email,
    });
  } catch (err) {
    logger.error({ err }, "Failed to start 2FA enrollment");
    return res.status(500).json({ error: "Could not start two-factor setup" });
  }
});

router.post("/auth/2fa/enroll-confirm", async (req, res) => {
  try {
    await ensureTwoFactorSchema();
    const challenge = await loadValidChallenge(readToken(req.body));
    if (!challenge?.pendingTotpSecret) {
      return res.status(400).json({ error: "Start setup first, then enter the authenticator code." });
    }

    const [user] = await db.select().from(users).where(eq(users.id, challenge.userId)).limit(1);
    if (!user || user.status !== "active") {
      return res.status(401).json({ error: "Verification expired. Please sign in again." });
    }

    let secretPlain: string;
    try {
      secretPlain = decryptSecret(challenge.pendingTotpSecret);
    } catch {
      return res.status(400).json({ error: "Setup expired. Please start again." });
    }

    if (!verifyTotpCode(secretPlain, readCode(req.body))) {
      await bumpChallengeAttempts(challenge.id, challenge.attempts ?? 0);
      return res.status(401).json({ error: "Invalid authentication code" });
    }

    const backupCodes = await persistEnrollment(user.id, secretPlain);
    await consumeChallenge(challenge.id);
    const loggedIn = await completeLoginSession(user, req, res);
    if (rememberRequested(req.body)) {
      await rememberTrustedDevice(user.id, req, res);
    }
    return res.json({ user: publicUser(loggedIn), backupCodes });
  } catch (err) {
    logger.error({ err }, "Failed to confirm 2FA enrollment");
    return res.status(500).json({ error: "Could not finish two-factor setup" });
  }
});

router.post("/auth/2fa/verify", async (req, res) => {
  try {
    await ensureTwoFactorSchema();
    const challenge = await loadValidChallenge(readToken(req.body));
    if (!challenge) return res.status(401).json({ error: "Verification expired. Please sign in again." });

    const [user] = await db.select().from(users).where(eq(users.id, challenge.userId)).limit(1);
    if (!user || user.status !== "active") {
      return res.status(401).json({ error: "Verification expired. Please sign in again." });
    }
    if (!isTwoFactorEnrolled(user)) {
      return res.status(400).json({ error: "Set up two-factor authentication first." });
    }

    const code = readCode(req.body);
    const useBackup = (req.body as { useBackupCode?: unknown })?.useBackupCode === true;
    const ok = useBackup ? await consumeUserBackupCode(user, code) : verifyUserTotp(user, code);
    if (!ok) {
      await bumpChallengeAttempts(challenge.id, challenge.attempts ?? 0);
      return res.status(401).json({
        error: useBackup ? "Invalid backup code" : "Invalid authentication code",
      });
    }

    await consumeChallenge(challenge.id);
    const loggedIn = await completeLoginSession(user, req, res);
    if (rememberRequested(req.body)) {
      await rememberTrustedDevice(user.id, req, res);
    }
    return res.json({ user: publicUser(loggedIn), usedBackupCode: useBackup });
  } catch (err) {
    logger.error({ err }, "Failed to verify 2FA");
    return res.status(500).json({ error: "Could not verify authentication code" });
  }
});

router.get("/auth/2fa/status", requireAuth, async (req, res) => {
  await ensureTwoFactorSchema();
  const user = req.session!.user;
  return res.json({
    enrolled: isTwoFactorEnrolled(user),
    backupCodesRemaining: user.totpBackupCodes
      ? (() => {
          try {
            const parsed = JSON.parse(user.totpBackupCodes) as unknown;
            return Array.isArray(parsed) ? parsed.length : 0;
          } catch {
            return 0;
          }
        })()
      : 0,
  });
});

router.post("/auth/2fa/backup-codes", requireAuth, async (req, res) => {
  try {
    await ensureTwoFactorSchema();
    const user = req.session!.user;
    if (!isTwoFactorEnrolled(user)) {
      return res.status(400).json({ error: "Two-factor authentication is not set up." });
    }
    if (!verifyUserTotp(user, readCode(req.body))) {
      return res.status(401).json({ error: "Invalid authentication code" });
    }
    const backupCodes = await replaceBackupCodes(user.id);
    return res.json({ backupCodes });
  } catch (err) {
    logger.error({ err }, "Failed to regenerate backup codes");
    return res.status(500).json({ error: "Could not generate backup codes" });
  }
});

router.post("/users/:id/reset-2fa", requireRole("super-admin"), async (req, res) => {
  try {
    await ensureTwoFactorSchema();
    const id = String(req.params.id);
    const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!target) return res.status(404).json({ error: "User not found" });
    await resetUserTwoFactor(target.id);
    logger.info({ actorId: req.session!.user.id, targetId: target.id }, "Super-admin reset user 2FA");
    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Failed to reset 2FA");
    return res.status(500).json({ error: "Could not reset two-factor authentication" });
  }
});

export default router;
