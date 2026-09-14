import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canRestoreDeletedAttachments } from "./attachment-permissions";

describe("canRestoreDeletedAttachments", () => {
  it("allows admin and super-admin only", () => {
    assert.equal(canRestoreDeletedAttachments({ role: "admin" }), true);
    assert.equal(canRestoreDeletedAttachments({ role: "super-admin" }), true);
    assert.equal(canRestoreDeletedAttachments({ role: "supervisor" }), false);
    assert.equal(canRestoreDeletedAttachments({ role: "user" }), false);
    assert.equal(canRestoreDeletedAttachments({ role: "coordinator" }), false);
  });
});
