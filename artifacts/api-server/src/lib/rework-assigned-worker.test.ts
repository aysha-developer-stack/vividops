import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  pickInferredReworkWorkerId,
  pickLatestExtraAssigneeId,
  reworkDisplayUserId,
} from "./rework-assigned-worker.ts";

describe("pickLatestExtraAssigneeId", () => {
  it("keeps the first assignee when nobody extra is on the job", () => {
    assert.equal(pickLatestExtraAssigneeId("zain", []), "zain");
  });

  it("uses the extra who was added last, not the first assignee", () => {
    assert.equal(pickLatestExtraAssigneeId("zain", ["ahmar", "yousaf"]), "ahmar");
  });
});

describe("pickInferredReworkWorkerId", () => {
  it("attributes the cycle to the extra who submitted it", () => {
    assert.equal(
      pickInferredReworkWorkerId({
        cycleOwnerId: "zain",
        workerIds: ["zain", "ahmar", "yousaf"],
        events: [
          { userId: "zain", at: 1 },
          { userId: "ahmar", at: 3 },
          { userId: "yousaf", at: 2 },
        ],
      }),
      "ahmar",
    );
  });

  it("keeps the first assignee when they were the only worker on that cycle", () => {
    assert.equal(
      pickInferredReworkWorkerId({
        cycleOwnerId: "zain",
        workerIds: ["zain", "ahmar"],
        events: [{ userId: "zain", at: 1 }],
      }),
      "zain",
    );
  });
});

describe("reworkDisplayUserId", () => {
  it("shows the extra who actually received the rework", () => {
    assert.equal(reworkDisplayUserId({ userId: "zain", assignedWorkerId: "ahmar" }), "ahmar");
  });

  it("falls back to the cycle owner when no extra was recorded", () => {
    assert.equal(reworkDisplayUserId({ userId: "zain", assignedWorkerId: null }), "zain");
  });
});
