import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  decryptSecret,
  encryptSecret,
  generateBackupCodes,
  generateTotpCode,
  generateTotpSecret,
  hashBackupCode,
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
    assert.equal(verifyTotpCode(secret, "000000", now), false);
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
