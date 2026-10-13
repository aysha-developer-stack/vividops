import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { pickReworkCycleForTimeLog } from "./time-log-cycle-pick.ts";

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
