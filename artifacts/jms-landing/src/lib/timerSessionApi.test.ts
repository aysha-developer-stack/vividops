import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isActiveTimerSessionRunning, liveSessionElapsedSeconds } from "./timerSessionApi.ts";

describe("isActiveTimerSessionRunning", () => {
  it("requires live running segment, not stale paused state", () => {
    assert.equal(
      isActiveTimerSessionRunning({
        segmentStartedAt: "2024-01-01T00:00:00.000Z",
        trackingPaused: true,
        isLive: false,
      }),
      false,
    );
    assert.equal(
      isActiveTimerSessionRunning({
        segmentStartedAt: "2024-01-01T00:00:00.000Z",
        trackingPaused: false,
        isLive: true,
      }),
      true,
    );
  });
});

describe("liveSessionElapsedSeconds", () => {
  const nowMs = 1_700_000_000_000;

  it("returns accumulated only when paused (no segment)", () => {
    const seconds = liveSessionElapsedSeconds(
      { accumulatedSeconds: 59, segmentStartedAt: null, trackingPaused: false },
      nowMs,
    );
    assert.equal(seconds, 59);
  });

  it("returns accumulated only when trackingPaused even if segment is set", () => {
    const segmentStartedAt = new Date(nowMs - 100_000).toISOString();
    const seconds = liveSessionElapsedSeconds(
      { accumulatedSeconds: 46, segmentStartedAt, trackingPaused: true },
      nowMs,
    );
    assert.equal(seconds, 46);
  });

  it("adds live segment time when running", () => {
    const segmentStartedAt = new Date(nowMs - 27_000).toISOString();
    const seconds = liveSessionElapsedSeconds(
      { accumulatedSeconds: 46, segmentStartedAt, trackingPaused: false },
      nowMs,
    );
    assert.equal(seconds, 73);
  });
});
