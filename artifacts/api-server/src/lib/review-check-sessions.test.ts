import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { reviewCheckElapsedSeconds } from "./review-check-sessions.ts";

describe("review check session duration math", () => {
  it("starts a fresh segment at zero", () => {
    const nowMs = 1_700_000_000_000;
    const elapsed = reviewCheckElapsedSeconds(
      {
        accumulatedSeconds: 0,
        segmentStartedAt: new Date(nowMs),
      },
      nowMs,
    );
    assert.equal(elapsed, 0);
  });

  it("does not include saved review logs in session elapsed (regression: timer starts at 1:40)", () => {
    const nowMs = 1_700_000_100_000;
    const elapsed = reviewCheckElapsedSeconds(
      {
        accumulatedSeconds: 0,
        segmentStartedAt: new Date(nowMs - 5_000),
      },
      nowMs,
    );
    assert.equal(elapsed, 5);
    assert.notEqual(elapsed, 100, "fresh session must not inherit historical saved seconds");
  });

  it("resumes a paused check from accumulated session time only", () => {
    const elapsed = reviewCheckElapsedSeconds(
      {
        accumulatedSeconds: 100,
        segmentStartedAt: null,
      },
      Date.now(),
    );
    assert.equal(elapsed, 100);
  });
});
