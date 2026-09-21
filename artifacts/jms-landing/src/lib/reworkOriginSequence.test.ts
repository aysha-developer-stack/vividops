import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  originSequenceByReworkId,
  reworkSequenceLabel,
} from "./reworkOriginSequence.ts";

describe("originSequenceByReworkId", () => {
  it("numbers internal and external rework on separate sequences", () => {
    const map = originSequenceByReworkId([
      { id: "e1", reworkOrigin: "external", assignedAt: "2026-09-14T10:00:00.000Z", cycleNumber: 1 },
      { id: "i1", reworkOrigin: "internal", assignedAt: "2026-09-14T12:00:00.000Z", cycleNumber: 2 },
      { id: "e2", reworkOrigin: "external", assignedAt: "2026-09-18T10:00:00.000Z", cycleNumber: 3 },
    ]);
    assert.equal(map.get("e1"), 1);
    assert.equal(map.get("e2"), 2);
    assert.equal(map.get("i1"), 1);
  });

  it("keeps supervisor rework on its own sequence", () => {
    const map = originSequenceByReworkId([
      { id: "s1", reworkOrigin: null, assignedAt: "2026-09-10T10:00:00.000Z", cycleNumber: 1 },
      { id: "i1", reworkOrigin: "internal", assignedAt: "2026-09-11T10:00:00.000Z", cycleNumber: 2 },
      { id: "s2", assignedAt: "2026-09-12T10:00:00.000Z", cycleNumber: 3 },
    ]);
    assert.equal(map.get("s1"), 1);
    assert.equal(map.get("s2"), 2);
    assert.equal(map.get("i1"), 1);
  });
});

describe("reworkSequenceLabel", () => {
  it("labels instruction and completed files by origin", () => {
    assert.equal(reworkSequenceLabel("internal", 1), "Internal #1");
    assert.equal(reworkSequenceLabel("external", 2), "External #2");
    assert.equal(reworkSequenceLabel(null, 1), "Rework #1");
    assert.equal(reworkSequenceLabel("internal", 1, "completed"), "Internal completed #1");
    assert.equal(reworkSequenceLabel("external", 2, "completed"), "External completed #2");
  });
});
