import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const TOTP_ISSUER = "VividOps";
export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_DIGITS = 6;
export const TOTP_WINDOW = 1;
export const BACKUP_CODE_COUNT = 10;
export const TRUSTED_DEVICE_TTL_DAYS = 30;
export const CHALLENGE_TTL_MS = 10 * 60 * 1000;
export const CHALLENGE_MAX_ATTEMPTS = 8;

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function encryptionKey(): Buffer {
  const secret = process.env.SESSION_SECRET || process.env.DATABASE_URL || "vividops-2fa-dev-key";
  return createHash("sha256").update(`vops-totp:${secret}`).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptSecret(payload: string): string {
  const buf = Buffer.from(payload, "base64");
  if (buf.length < 29) throw new Error("Invalid encrypted secret");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

export function encodeBase32(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

export function decodeBase32(input: string): Buffer {
  const cleaned = input.replace(/=+$/g, "").toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of cleaned) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function generateTotpSecret(): string {
  return encodeBase32(randomBytes(20));
}

function hotp(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", secret).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, "0");
}

export function generateTotpCode(secretBase32: string, atMs = Date.now()): string {
  const secret = decodeBase32(secretBase32);
  const counter = Math.floor(atMs / 1000 / TOTP_PERIOD_SECONDS);
  return hotp(secret, counter);
}

export function verifyTotpCode(secretBase32: string, code: string, atMs = Date.now()): boolean {
  const normalized = (code ?? "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(normalized)) return false;
  const secret = decodeBase32(secretBase32);
  const counter = Math.floor(atMs / 1000 / TOTP_PERIOD_SECONDS);
  const expected = Buffer.from(normalized);
  for (let i = -TOTP_WINDOW; i <= TOTP_WINDOW; i += 1) {
    const candidate = Buffer.from(hotp(secret, counter + i));
    if (candidate.length === expected.length && timingSafeEqual(candidate, expected)) {
      return true;
    }
  }
  return false;
}

export function totpOtpauthUrl(email: string, secretBase32: string): string {
  const label = encodeURIComponent(`${TOTP_ISSUER}:${email}`);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer: TOTP_ISSUER,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

export function generateBackupCodes(): string[] {
  const codes: string[] = [];
  while (codes.length < BACKUP_CODE_COUNT) {
    const raw = encodeBase32(randomBytes(5)).slice(0, 8);
    codes.push(`${raw.slice(0, 4)}-${raw.slice(4, 8)}`);
  }
  return codes;
}

export function normalizeBackupCode(code: string): string {
  return (code ?? "").toUpperCase().replace(/[^A-Z2-7]/g, "");
}

export function hashToken(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function hashBackupCode(code: string): string {
  return hashToken(`backup:${normalizeBackupCode(code)}`);
}

export function verifyBackupCode(code: string, hashes: string[]): { ok: boolean; remaining: string[] } {
  const target = hashBackupCode(code);
  const remaining: string[] = [];
  let matched = false;
  for (const hash of hashes) {
    if (!matched && hash.length === target.length && timingSafeEqual(Buffer.from(hash), Buffer.from(target))) {
      matched = true;
      continue;
    }
    remaining.push(hash);
  }
  return { ok: matched, remaining };
}

export function parseBackupCodeHashes(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***";
  const visible = local.slice(0, 1);
  return `${visible}***@${domain}`;
}

export function randomToken(): string {
  return randomBytes(32).toString("hex");
}
