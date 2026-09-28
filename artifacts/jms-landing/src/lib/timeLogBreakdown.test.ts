import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildTimeLogCycleBreakdown,
  matchReworkForTimeLog,
  timeLogReworkLabel,
} from "./timeLogBreakdown.ts";

const worker = "user-1";

const reworks = [
  { id: "e1", userId: worker, reworkOrigin: "external", assignedAt: "2026-08-27T10:00:00.000Z", cycleNumber: 1 },
  { id: "i1", userId: worker, reworkOrigin: "internal", assignedAt: "2026-09-01T10:00:00.000Z", cycleNumber: 2 },
  { id: "e3", userId: worker, reworkOrigin: "external", assignedAt: "2026-09-07T10:00:00.000Z", cycleNumber: 3 },
  { id: "e4", userId: worker, reworkOrigin: "external", assignedAt: "2026-09-10T10:00:00.000Z", cycleNumber: 4 },
  { id: "e5", userId: worker, reworkOrigin: "external", assignedAt: "2026-09-17T10:00:00.000Z", cycleNumber: 5 },
  { id: "open", userId: worker, reworkOrigin: "external", assignedAt: "2026-09-28T06:00:00.000Z", cycleNumber: 3 },
];

describe("matchReworkForTimeLog", () => {
  it("keeps old cycle-3 time on the completed rework, not the new open duplicate", () => {
    const oldLog = {
      userId: worker,
      reworkCycleNumber: 3,
      createdAt: "2026-09-07T12:00:00.000Z",
      duration: 1922,
    };
    const newLog = {
      userId: worker,
      reworkCycleNumber: 3,
      createdAt: "2026-09-28T12:20:00.000Z",
      duration: 1983,
    };
    assert.equal(matchReworkForTimeLog(oldLog, reworks)?.id, "e3");
    assert.equal(matchReworkForTimeLog(newLog, reworks)?.id, "open");
    assert.equal(timeLogReworkLabel(oldLog, reworks), "External #2");
    assert.equal(timeLogReworkLabel(newLog, reworks), "External #5");
  });
});

describe("buildTimeLogCycleBreakdown", () => {
  it("does not merge new timer logs into an earlier rework that reused the same cycle number", () => {
    const rows = buildTimeLogCycleBreakdown(
      [
        { duration: 100, reworkCycleNumber: null, createdAt: "2026-08-01T10:00:00.000Z", userId: worker },
        { duration: 1922, reworkCycleNumber: 3, createdAt: "2026-09-07T12:00:00.000Z", userId: worker },
        { duration: 1983, reworkCycleNumber: 3, createdAt: "2026-09-28T12:20:00.000Z", userId: worker },
        { duration: 5, reworkCycleNumber: 3, createdAt: "2026-09-28T12:21:00.000Z", userId: worker },
      ],
      reworks,
    );

    const oldCycle = rows.find((row) => row.key === "e3");
    const openCycle = rows.find((row) => row.key === "open");
    assert.equal(oldCycle?.label, "External #2");
    assert.equal(oldCycle?.seconds, 1922);
    assert.equal(openCycle?.label, "External #5");
    assert.equal(openCycle?.seconds, 1988);
  });

  it("still groups by stored cycle when no rework rows are provided", () => {
    const rows = buildTimeLogCycleBreakdown([
      { duration: 10, reworkCycleNumber: null },
      { duration: 5, reworkCycleNumber: 3 },
      { duration: 7, reworkCycleNumber: 3 },
    ]);
    assert.equal(rows[0]?.label, "Original work");
    assert.equal(rows[0]?.seconds, 10);
    assert.equal(rows[1]?.label, "Rework #3");
    assert.equal(rows[1]?.seconds, 12);
  });
});
