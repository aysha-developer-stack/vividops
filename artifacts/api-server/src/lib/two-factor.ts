import { and, eq, gt } from "drizzle-orm";
import type { Request, Response } from "express";
import {
  db,
  twoFactorChallenges,
  twoFactorTrustedDevices,
  userSettings,
  users,
  type UserRow,
} from "@workspace/db";
import {
  CHALLENGE_MAX_ATTEMPTS,
  CHALLENGE_TTL_MS,
  TRUSTED_DEVICE_TTL_DAYS,
  decryptSecret,
  encryptSecret,
  generateBackupCodes,
  hashBackupCode,
  hashToken,
  maskEmail,
  parseBackupCodeHashes,
  randomToken,
  verifyBackupCode,
  verifyTotpCode,
} from "./totp";

export const TWO_FACTOR_TRUST_COOKIE = "vops_2fa_trust";

export function isTwoFactorEnrolled(user: Pick<UserRow, "totpSecret" | "totpEnrolledAt">): boolean {
  return !!user.totpSecret && !!user.totpEnrolledAt;
}

export function twoFactorChallengePayload(user: UserRow, challengeToken: string) {
  return {
    requiresTwoFactor: true as const,
    challengeToken,
    twoFactorEnrolled: isTwoFactorEnrolled(user),
    maskedEmail: maskEmail(user.email),
  };
}

export async function createTwoFactorChallenge(userId: string): Promise<string> {
  const token = randomToken();
  await db.delete(twoFactorChallenges).where(eq(twoFactorChallenges.userId, userId));
  await db.insert(twoFactorChallenges).values({
    userId,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
  });
  return token;
}

export async function loadValidChallenge(token: string) {
  if (!token || typeof token !== "string") return null;
  const [row] = await db
    .select()
    .from(twoFactorChallenges)
    .where(
      and(
        eq(twoFactorChallenges.tokenHash, hashToken(token)),
        gt(twoFactorChallenges.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!row) return null;
  if ((row.attempts ?? 0) >= CHALLENGE_MAX_ATTEMPTS) {
    await db.delete(twoFactorChallenges).where(eq(twoFactorChallenges.id, row.id));
    return null;
  }
  return row;
}

export async function bumpChallengeAttempts(challengeId: string, current: number): Promise<void> {
  const next = current + 1;
  if (next >= CHALLENGE_MAX_ATTEMPTS) {
    await db.delete(twoFactorChallenges).where(eq(twoFactorChallenges.id, challengeId));
    return;
  }
  await db
    .update(twoFactorChallenges)
    .set({ attempts: next })
    .where(eq(twoFactorChallenges.id, challengeId));
}

export async function consumeChallenge(challengeId: string): Promise<void> {
  await db.delete(twoFactorChallenges).where(eq(twoFactorChallenges.id, challengeId));
}

export function readTrustCookie(req: Request): string {
  const raw = req.cookies?.[TWO_FACTOR_TRUST_COOKIE];
  return typeof raw === "string" ? raw : "";
}

export async function hasValidTrustedDevice(userId: string, token: string): Promise<boolean> {
  if (!token) return false;
  const [row] = await db
    .select({ id: twoFactorTrustedDevices.id })
    .from(twoFactorTrustedDevices)
    .where(
      and(
        eq(twoFactorTrustedDevices.userId, userId),
        eq(twoFactorTrustedDevices.tokenHash, hashToken(token)),
        gt(twoFactorTrustedDevices.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return !!row;
}

export function trustCookieOpts(req?: Request) {
  const forwarded = req?.headers?.["x-forwarded-proto"];
  const proto = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim();
  const secure =
    process.env.COOKIE_SECURE === "true" ||
    proto === "https" ||
    req?.secure === true ||
    process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge: TRUSTED_DEVICE_TTL_DAYS * 24 * 60 * 60 * 1000,
  };
}

export async function rememberTrustedDevice(userId: string, req: Request, res: Response): Promise<void> {
  const token = randomToken();
  await db.insert(twoFactorTrustedDevices).values({
    userId,
    tokenHash: hashToken(token),
    userAgent: typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"].slice(0, 240) : null,
    expiresAt: new Date(Date.now() + TRUSTED_DEVICE_TTL_DAYS * 24 * 60 * 60 * 1000),
  });
  res.cookie(TWO_FACTOR_TRUST_COOKIE, token, trustCookieOpts(req));
}

export async function clearTrustedDevicesForUser(userId: string): Promise<void> {
  await db.delete(twoFactorTrustedDevices).where(eq(twoFactorTrustedDevices.userId, userId));
}

export function verifyUserTotp(user: UserRow, code: string): boolean {
  if (!user.totpSecret) return false;
  try {
    return verifyTotpCode(decryptSecret(user.totpSecret), code);
  } catch {
    return false;
  }
}

export async function consumeUserBackupCode(user: UserRow, code: string): Promise<boolean> {
  const hashes = parseBackupCodeHashes(user.totpBackupCodes);
  const result = verifyBackupCode(code, hashes);
  if (!result.ok) return false;
  await db
    .update(users)
    .set({ totpBackupCodes: JSON.stringify(result.remaining), updatedAt: new Date() })
    .where(eq(users.id, user.id));
  return true;
}

export async function persistEnrollment(userId: string, secretPlain: string): Promise<string[]> {
  const codes = generateBackupCodes();
  const now = new Date();
  await db
    .update(users)
    .set({
      totpSecret: encryptSecret(secretPlain),
      totpEnrolledAt: now,
      totpBackupCodes: JSON.stringify(codes.map(hashBackupCode)),
      updatedAt: now,
    })
    .where(eq(users.id, userId));
  await syncTwoFactorSettingsFlag(userId, true);
  return codes;
}

export async function replaceBackupCodes(userId: string): Promise<string[]> {
  const codes = generateBackupCodes();
  await db
    .update(users)
    .set({
      totpBackupCodes: JSON.stringify(codes.map(hashBackupCode)),
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
  return codes;
}

export async function resetUserTwoFactor(userId: string): Promise<void> {
  await db
    .update(users)
    .set({
      totpSecret: null,
      totpEnrolledAt: null,
      totpBackupCodes: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
  await db.delete(twoFactorChallenges).where(eq(twoFactorChallenges.userId, userId));
  await clearTrustedDevicesForUser(userId);
  await syncTwoFactorSettingsFlag(userId, false);
}

export async function syncTwoFactorSettingsFlag(userId: string, enabled: boolean): Promise<void> {
  try {
    await db
      .insert(userSettings)
      .values({ userId, twoFactorEnabled: enabled, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: userSettings.userId,
        set: { twoFactorEnabled: enabled, updatedAt: new Date() },
      });
  } catch {
    // Settings row is optional metadata; enrollment itself already succeeded.
  }
}
