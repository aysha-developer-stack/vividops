import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isOwnChecklistWork,
  resolveChecklistTargetUserId,
} from "./working-supervisor.ts";
import type { JobRow, UserRow } from "@workspace/db";

const job = {
  id: "job-1",
  assigneeId: "worker-a",
  supervisorId: "sup-1",
} as JobRow;

const workerA = { id: "worker-a", role: "user" } as UserRow;
const workerB = { id: "worker-b", role: "user" } as UserRow;
const admin = { id: "admin-1", role: "admin" } as UserRow;

describe("resolveChecklistTargetUserId", () => {
  it("lets extra assignees share the first assignee's checklist", () => {
    assert.equal(resolveChecklistTargetUserId(workerA, job, null), "worker-a");
    assert.equal(resolveChecklistTargetUserId(workerB, job, null), "worker-a");
  });

  it("lets admins inspect a specific worker checklist", () => {
    assert.equal(resolveChecklistTargetUserId(admin, job, "worker-b"), "worker-b");
    assert.equal(resolveChecklistTargetUserId(admin, job, null), "worker-a");
  });
});

describe("isOwnChecklistWork", () => {
  it("lets an extra assignee complete the shared first-assignee checklist", () => {
    assert.equal(isOwnChecklistWork(workerA, job, "worker-a"), true);
    assert.equal(isOwnChecklistWork(workerB, job, "worker-a"), true);
    assert.equal(isOwnChecklistWork(workerB, job, "worker-b"), true);
  });
});
