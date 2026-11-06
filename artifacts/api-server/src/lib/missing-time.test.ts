import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseMissingTimeDuration } from "./missing-time.ts";

describe("parseMissingTimeDuration", () => {
  it("accepts 2 hours", () => {
    const parsed = parseMissingTimeDuration(2, 0);
    assert.deepEqual(parsed, { ok: true, seconds: 2 * 3600 });
  });

  it("accepts hours and minutes together", () => {
    const parsed = parseMissingTimeDuration("1", "30");
    assert.deepEqual(parsed, { ok: true, seconds: 90 * 60 });
  });

  it("rejects zero", () => {
    const parsed = parseMissingTimeDuration(0, 0);
    assert.equal(parsed.ok, false);
  });

  it("rejects more than 12 hours", () => {
    const parsed = parseMissingTimeDuration(13, 0);
    assert.equal(parsed.ok, false);
  });

  it("rejects invalid minutes", () => {
    const parsed = parseMissingTimeDuration(1, 60);
    assert.equal(parsed.ok, false);
  });
});
