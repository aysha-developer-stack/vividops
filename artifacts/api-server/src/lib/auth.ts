import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";

const BCRYPT_ROUNDS = 10;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function generateTempPassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%&*";
  const all = upper + lower + digits + symbols;
  const buf = randomBytes(12);
  const required = [
    upper[buf[0] % upper.length],
    lower[buf[1] % lower.length],
    digits[buf[2] % digits.length],
    symbols[buf[3] % symbols.length],
  ];
  const rest = Array.from(
    { length: 8 },
    (_, i) => all[buf[4 + i] % all.length],
  );
  return [...required, ...rest]
    .sort(() => (randomBytes(1)[0] < 128 ? -1 : 1))
    .join("");
}

export const SESSION_COOKIE = "vops_session";
export const SESSION_TTL_DAYS = 30;

export function sessionExpiresAt(now = new Date()): Date {
  return new Date(now.getTime() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
}
