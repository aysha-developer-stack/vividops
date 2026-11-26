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
  BREAK_HOUR_SECONDS,
  BREAK_SHORT_SECONDS,
  countBreaksUsed,
  secondsUntilBreakExpiry,
  breakLimitPerDay,
  isInteractiveForFreeTime,
  FREE_TIME_INTERACTION_MAX_MS,
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

describe("paid breaks", () => {
  it("allows one 1-hour and two 15-minute breaks per day", () => {
    assert.equal(breakLimitPerDay("break_hour"), 1);
    assert.equal(breakLimitPerDay("break_short"), 2);
    assert.equal(BREAK_HOUR_SECONDS, 3600);
    assert.equal(BREAK_SHORT_SECONDS, 900);
  });

  it("counts each started break against that day's allowance", () => {
    const rows = [
      { kind: "break_hour", reportDate: "2026-11-25" },
      { kind: "break_short", reportDate: "2026-11-25" },
      { kind: "break_short", reportDate: "2026-11-25" },
      { kind: "break_short", reportDate: "2026-11-24" },
      { kind: "free", reportDate: "2026-11-25" },
    ];
    assert.equal(countBreaksUsed(rows, "break_hour", "2026-11-25"), 1);
    assert.equal(countBreaksUsed(rows, "break_short", "2026-11-25"), 2);
    assert.equal(countBreaksUsed(rows, "break_short", "2026-11-24"), 1);
  });

  it("expires a 15 minute break on time", () => {
    const started = new Date("2026-11-25T05:00:00.000Z");
    const now = new Date("2026-11-25T05:12:00.000Z");
    assert.equal(secondsUntilBreakExpiry(started, "break_short", now), 3 * 60);
    assert.equal(secondsUntilBreakExpiry(started, "break_short", new Date("2026-11-25T05:20:00.000Z")), 0);
  });
});

describe("isInteractiveForFreeTime", () => {
  it("requires a click or type within one hour and after PKT midnight", () => {
    const now = new Date("2026-11-25T10:00:00.000Z"); // 15:00 PKT
    assert.equal(isInteractiveForFreeTime({ lastInteractiveAt: null, now }), false);
    assert.equal(
      isInteractiveForFreeTime({ lastInteractiveAt: new Date(now.getTime() - 59 * 60 * 1000), now }),
      true,
    );
    assert.equal(
      isInteractiveForFreeTime({
        lastInteractiveAt: new Date(now.getTime() - FREE_TIME_INTERACTION_MAX_MS - 1000),
        now,
      }),
      false,
    );
  });

  it("does not treat yesterday's click as today's idle", () => {
    const now = new Date("2026-11-18T19:30:00.000Z"); // 00:30 PKT 19 Nov
    const lastNight = new Date("2026-11-18T18:50:00.000Z"); // 23:50 PKT 18 Nov
    assert.equal(isInteractiveForFreeTime({ lastInteractiveAt: lastNight, now }), false);
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
