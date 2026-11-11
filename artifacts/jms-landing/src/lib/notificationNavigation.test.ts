import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { jobTabForNotification, jobTabsForNotification } from "./notificationNavigation.ts";

describe("jobTabForNotification", () => {
  it("maps each notification type onto the matching job tab", () => {
    assert.equal(jobTabForNotification({ type: "file", jobId: "j1" }), "files");
    assert.equal(jobTabForNotification({ type: "checklist", jobId: "j1" }), "files");
    assert.equal(jobTabForNotification({ type: "job_message", jobId: "j1" }), "communication");
    assert.equal(jobTabForNotification({ type: "timer", jobId: "j1" }), "logs");
    assert.equal(jobTabForNotification({ type: "error", jobId: "j1" }), "mistakes");
    assert.equal(jobTabForNotification({ type: "rework", jobId: "j1" }), "mistakes");
    assert.equal(jobTabForNotification({ type: "appreciation", jobId: "j1" }), "appreciation");
    assert.equal(jobTabForNotification({ type: "note", jobId: "j1" }), "notes");
    assert.equal(jobTabForNotification({ type: "assigned", jobId: "j1" }), "overview");
  });

  it("sends legacy note alerts to Notes even when they were saved as updated", () => {
    assert.equal(
      jobTabForNotification({
        type: "updated",
        jobId: "j1",
        title: "New note on Kitchen job",
        description: "Shoaib added a general note: Check braces",
      }),
      "notes",
    );
  });

  it("also dots Comments when a review notification includes a comment", () => {
    assert.deepEqual(
      jobTabsForNotification({
        type: "checklist",
        jobId: "j1",
        title: "Ready for Supervisor Review: Kitchen",
        description: "Shoaib finished work on Kitchen. Note: Please check the corners.",
      }),
      ["files", "completion"],
    );
  });

  it("does not map training alerts onto a job tab", () => {
    assert.equal(jobTabForNotification({ type: "training" }), null);
    assert.deepEqual(jobTabsForNotification({ type: "training" }), []);
  });
});
