import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { pickReworkCycleForTimeLog, pickReworkForUntaggedTimeLog } from "./time-log-cycle-pick.ts";

describe("pickReworkCycleForTimeLog", () => {
  it("lets an extra assignee stamp the shared first-assignee rework cycle", () => {
    assert.equal(
      pickReworkCycleForTimeLog([{ cycleNumber: 4, userId: "zain" }], "ahmar"),
      4,
    );
  });

  it("prefers the acting worker's own cycle when they have one", () => {
    assert.equal(
      pickReworkCycleForTimeLog(
        [
          { cycleNumber: 2, userId: "ahmar" },
          { cycleNumber: 4, userId: "zain" },
        ],
        "ahmar",
      ),
      2,
    );
  });
});

describe("pickReworkForUntaggedTimeLog", () => {
  const internal = {
    id: "internal-4",
    userId: "zain",
    assignedWorkerId: "ahmar",
    cycleNumber: 4,
    assignedAtMs: Date.parse("2026-10-13T09:00:00.000Z"),
    status: "approved",
  };
  const external = {
    id: "external-4",
    userId: "zain",
    assignedWorkerId: "ahmar",
    cycleNumber: 5,
    assignedAtMs: Date.parse("2026-10-13T10:00:00.000Z"),
    status: "approved",
  };

  it("puts Ahmar's untagged external rework time on that cycle, not Original", () => {
    const matched = pickReworkForUntaggedTimeLog(
      { userId: "ahmar", at: Date.parse("2026-10-13T11:00:00.000Z") },
      [internal, external],
    );
    assert.equal(matched?.id, "external-4");
    assert.equal(matched?.cycleNumber, 5);
  });

  it("leaves time before any rework as original", () => {
    assert.equal(
      pickReworkForUntaggedTimeLog(
        { userId: "ahmar", at: Date.parse("2026-10-12T11:00:00.000Z") },
        [internal, external],
      ),
      null,
    );
  });
});
