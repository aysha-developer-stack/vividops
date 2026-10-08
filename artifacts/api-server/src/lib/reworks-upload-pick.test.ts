import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { pickActiveReworkIdForUpload } from "./rework-upload-pick.ts";

describe("pickActiveReworkIdForUpload", () => {
  const jobLevel = { id: "rw-job", userId: "worker-a", checklistItemId: null };
  const itemOnA = { id: "rw-item-a", userId: "worker-a", checklistItemId: 2 };
  const itemOnB = { id: "rw-item-b", userId: "worker-b", checklistItemId: 3 };

  it("lets a second assignee use the primary's job-level rework cycle", () => {
    assert.equal(
      pickActiveReworkIdForUpload([jobLevel], { userId: "worker-b", checklistItemId: 1 }),
      "rw-job",
    );
  });

  it("prefers the acting worker's own cycle when they have one", () => {
    assert.equal(
      pickActiveReworkIdForUpload([jobLevel, itemOnB], {
        userId: "worker-b",
        checklistItemId: 3,
      }),
      "rw-item-b",
    );
  });

  it("shares the same checklist-item cycle with another assignee", () => {
    assert.equal(
      pickActiveReworkIdForUpload([itemOnA], { userId: "worker-b", checklistItemId: 2 }),
      "rw-item-a",
    );
  });

  it("does not attach a different item's rework to an extra assignee", () => {
    assert.equal(
      pickActiveReworkIdForUpload([itemOnA], { userId: "worker-b", checklistItemId: 1 }),
      null,
    );
  });
});
