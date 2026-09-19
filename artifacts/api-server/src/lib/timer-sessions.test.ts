import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  timerSessionBillableSeconds,
  timerSessionElapsedSeconds,
  isTimerSessionStale,
  resolveTimerSaveDuration,
  TIMER_HEARTBEAT_GAP_PAUSE_MS,
} from "./timer-sessions.ts";

function session(overrides: {
  accumulatedSeconds?: number;
  segmentStartedAt?: Date | null;
  lastHeartbeatAt?: Date;
}) {
  const now = Date.now();
  return {
    accumulatedSeconds: overrides.accumulatedSeconds ?? 0,
    segmentStartedAt: overrides.segmentStartedAt ?? null,
    lastHeartbeatAt: overrides.lastHeartbeatAt ?? new Date(now),
  };
}

describe("timer session duration math", () => {
  it("does not bill idle time after the last heartbeat (pause / sleep / on-hold)", () => {
    const nowMs = 1_700_000_000_000;
    const segStart = new Date(nowMs - 3 * 3600 * 1000);
    const lastHb = new Date(nowMs - 3 * 3600 * 1000 + 26 * 60 * 1000); // heartbeats stopped after ~26m
    const row = session({
      accumulatedSeconds: 0,
      segmentStartedAt: segStart,
      lastHeartbeatAt: lastHb,
    });

    const elapsed = timerSessionElapsedSeconds(row, nowMs);
    const billable = timerSessionBillableSeconds(row, nowMs);
    const saved = resolveTimerSaveDuration(row, nowMs);

    assert.equal(elapsed, 3 * 3600);
    assert.ok(billable <= 29 * 60, "billable must cap at last heartbeat + grace (~26m + 3m)");
    assert.equal(saved, billable, "stop / pause / on-hold must save billed time only");
    assert.ok(saved < elapsed, "idle gap after last heartbeat is not billed");
  });

  it("paused sessions keep accumulated billed seconds only", () => {
    const nowMs = 1_700_000_000_000;
    const row = session({
      accumulatedSeconds: 1800,
      segmentStartedAt: null,
      lastHeartbeatAt: new Date(nowMs),
    });
    assert.equal(timerSessionElapsedSeconds(row, nowMs), 1800);
    assert.equal(timerSessionBillableSeconds(row, nowMs), 1800);
    assert.equal(resolveTimerSaveDuration(row, nowMs), 1800);
  });

  it("marks sessions stale after heartbeat gap", () => {
    const nowMs = 1_700_000_000_000;
    const row = session({
      segmentStartedAt: new Date(nowMs - 60_000),
      lastHeartbeatAt: new Date(nowMs - TIMER_HEARTBEAT_GAP_PAUSE_MS - 1),
    });
    assert.equal(isTimerSessionStale(row, nowMs), true);
  });

  it("does not mark fresh sessions stale", () => {
    const nowMs = 1_700_000_000_000;
    const row = session({
      segmentStartedAt: new Date(nowMs - 60_000),
      lastHeartbeatAt: new Date(nowMs - 30_000),
    });
    assert.equal(isTimerSessionStale(row, nowMs), false);
  });
});
