import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  decryptSecret,
  decryptSecretWithMeta,
  encryptSecret,
  generateBackupCodes,
  generateTotpCode,
  generateTotpSecret,
  hashBackupCode,
  looksLikeBackupCode,
  maskEmail,
  normalizeBackupCode,
  totpOtpauthUrl,
  verifyBackupCode,
  verifyTotpCode,
} from "./totp.ts";

describe("TOTP", () => {
  it("round-trips encrypted secrets", () => {
    const secret = generateTotpSecret();
    assert.equal(decryptSecret(encryptSecret(secret)), secret);
  });

  it("verifies the current authenticator code and rejects a wrong one", () => {
    const secret = generateTotpSecret();
    const now = 1_700_000_000_000;
    const code = generateTotpCode(secret, now);
    assert.equal(code.length, 6);
    assert.equal(verifyTotpCode(secret, code, now), true);
    assert.equal(verifyTotpCode(secret, code, now + 30_000), true);
    assert.equal(verifyTotpCode(secret, code, now + 60_000), true);
    assert.equal(verifyTotpCode(secret, code, now + 90_000), false);
    assert.equal(verifyTotpCode(secret, "000000", now), false);
  });

  it("decrypts a secret after SESSION_SECRET is added on top of the old DATABASE_URL key", () => {
    const origSession = process.env.SESSION_SECRET;
    const origDb = process.env.DATABASE_URL;
    try {
      delete process.env.SESSION_SECRET;
      process.env.DATABASE_URL = "postgres://legacy-url";
      const secret = generateTotpSecret();
      const encrypted = encryptSecret(secret);
      process.env.SESSION_SECRET = "new-session-secret";
      const decrypted = decryptSecretWithMeta(encrypted);
      assert.equal(decrypted.plain, secret);
      assert.equal(decrypted.usedFallback, true);
      assert.equal(decryptSecret(encrypted), secret);
    } finally {
      if (origSession === undefined) delete process.env.SESSION_SECRET;
      else process.env.SESSION_SECRET = origSession;
      if (origDb === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = origDb;
    }
  });

  it("treats copied XXXX-XXXX codes as backup codes, not authenticator digits", () => {
    assert.equal(looksLikeBackupCode("AB3D-EF2G"), true);
    assert.equal(looksLikeBackupCode("123456"), false);
  });

  it("builds a VividOps otpauth URL", () => {
    const url = totpOtpauthUrl("shoaib@example.com", "MFRGGZDF");
    assert.match(url, /^otpauth:\/\/totp\/VividOps/);
    assert.match(url, /issuer=VividOps/);
    assert.match(url, /secret=MFRGGZDF/);
  });

  it("consumes a backup code once", () => {
    const codes = generateBackupCodes();
    assert.equal(codes.length, 10);
    const hashes = codes.map(hashBackupCode);
    const first = verifyBackupCode(codes[0], hashes);
    assert.equal(first.ok, true);
    assert.equal(first.remaining.length, 9);
    const again = verifyBackupCode(codes[0], first.remaining);
    assert.equal(again.ok, false);
    const spaced = verifyBackupCode(normalizeBackupCode(codes[1]).replace(/(.{4})(.{4})/, "$1-$2"), first.remaining);
    assert.equal(spaced.ok, true);
  });

  it("masks emails without revealing the local part", () => {
    assert.equal(maskEmail("shoaib@vividops.com.au"), "s***@vividops.com.au");
  });
});
