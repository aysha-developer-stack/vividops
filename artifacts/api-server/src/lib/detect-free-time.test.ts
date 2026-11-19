import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isOnJobTimer,
  liveFreeDurationSeconds,
  pktDateString,
  pktDayStart,
  shouldKeepClosedPeriod,
  MIN_FREE_TIME_SECONDS,
  MAX_FREE_TIME_SECONDS,
} from "./detect-free-time.ts";

describe("liveFreeDurationSeconds", () => {
  it("counts from start until now when still open", () => {
    const started = new Date("2026-11-19T04:00:00.000Z");
    const now = new Date("2026-11-19T05:10:00.000Z");
    assert.equal(liveFreeDurationSeconds(started, null, now), 70 * 60);
  });

  it("caps at 12 hours", () => {
    const started = new Date("2026-11-19T00:00:00.000Z");
    const now = new Date("2026-11-19T20:00:00.000Z");
    assert.equal(liveFreeDurationSeconds(started, null, now), MAX_FREE_TIME_SECONDS);
  });
});

describe("shouldKeepClosedPeriod", () => {
  it("drops gaps shorter than 5 minutes", () => {
    assert.equal(shouldKeepClosedPeriod(4 * 60), false);
    assert.equal(shouldKeepClosedPeriod(MIN_FREE_TIME_SECONDS), true);
  });
});

describe("isOnJobTimer", () => {
  it("treats a live running segment as working", () => {
    const now = Date.parse("2026-11-19T10:00:00.000Z");
    assert.equal(
      isOnJobTimer(
        {
          segmentStartedAt: new Date("2026-11-19T09:50:00.000Z"),
          lastHeartbeatAt: new Date("2026-11-19T09:59:30.000Z"),
        },
        now,
      ),
      true,
    );
  });

  it("treats a paused timer as free", () => {
    assert.equal(
      isOnJobTimer({
        segmentStartedAt: null,
        lastHeartbeatAt: new Date("2026-11-19T09:59:30.000Z"),
      }),
      false,
    );
  });
});

describe("pkt day helpers", () => {
  it("uses Asia/Karachi calendar date", () => {
    assert.equal(pktDateString(new Date("2026-11-18T19:30:00.000Z")), "2026-11-19");
  });

  it("starts the PKT day at UTC+5 midnight", () => {
    assert.equal(pktDayStart("2026-11-19").toISOString(), "2026-11-18T19:00:00.000Z");
  });
});
