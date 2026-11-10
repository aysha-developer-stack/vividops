import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { remainingDeadlineSeconds } from "./timerActivityPing.ts";

describe("remainingDeadlineSeconds", () => {
  it("returns full seconds until the deadline", () => {
    assert.equal(remainingDeadlineSeconds(1_000_300, 1_000_000), 1);
    assert.equal(remainingDeadlineSeconds(1_000_000 + 300_000, 1_000_000), 300);
  });

  it("does not go negative after the deadline", () => {
    assert.equal(remainingDeadlineSeconds(1_000_000, 1_000_500), 0);
  });

  it("treats a missing deadline as zero", () => {
    assert.equal(remainingDeadlineSeconds(null, 1_000_000), 0);
  });
});
