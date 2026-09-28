import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  jobStatusSortPriority,
  sortJobs,
  type JobSortFields,
} from "./jobListSort.ts";

const fields = (status: string, number: string, createdAt?: string): JobSortFields => ({
  status,
  number,
  createdAt: createdAt ?? "2026-01-01T00:00:00.000Z",
});

describe("jobStatusSortPriority", () => {
  it("ranks rework and in-progress above done", () => {
    assert.ok(jobStatusSortPriority("Rework") < jobStatusSortPriority("In Progress"));
    assert.ok(jobStatusSortPriority("In Progress") < jobStatusSortPriority("Not Started"));
    assert.ok(jobStatusSortPriority("Not Started") < jobStatusSortPriority("Done"));
    assert.ok(jobStatusSortPriority("Done") < jobStatusSortPriority("Cancelled"));
  });

  it("treats Finished like Done", () => {
    assert.equal(jobStatusSortPriority("Finished"), jobStatusSortPriority("Done"));
  });
});

describe("sortJobs", () => {
  it("sorts highest job number first, including done jobs", () => {
    const jobs = [
      { id: "done-high", ...fields("Done", "JOB-999999", "2026-08-01T00:00:00.000Z") },
      { id: "rework-low", ...fields("Rework", "JOB-000100", "2026-01-01T00:00:00.000Z") },
      { id: "progress-mid", ...fields("In Progress", "JOB-000500", "2026-02-01T00:00:00.000Z") },
      { id: "pending-old", ...fields("Not Started", "JOB-000050", "2026-03-01T00:00:00.000Z") },
    ];

    const sorted = sortJobs(jobs, "jobNumber", (j) => j);
    assert.deepEqual(
      sorted.map((j) => j.id),
      ["done-high", "progress-mid", "rework-low", "pending-old"],
    );
  });

  it("sorts newest created jobs first on recent mode, even when not started", () => {
    const jobs = [
      { id: "older-progress", ...fields("In Progress", "JOB-000200", "2026-01-01T00:00:00.000Z") },
      { id: "newer-pending", ...fields("Not Started", "JOB-000100", "2026-08-01T00:00:00.000Z") },
      { id: "mid-rework", ...fields("Rework", "JOB-000150", "2026-04-01T00:00:00.000Z") },
    ];

    const sorted = sortJobs(jobs, "recent", (j) => j);
    assert.deepEqual(sorted.map((j) => j.id), ["newer-pending", "mid-rework", "older-progress"]);
  });

  it("sorts recently updated by latest message even when the job is done", () => {
    const jobs = [
      {
        id: "old-rework",
        status: "Rework",
        number: "JOB-000200",
        createdAt: "2026-01-01T00:00:00.000Z",
        lastMessageAt: "2026-01-02T00:00:00.000Z",
      },
      {
        id: "new-done-chat",
        status: "Done",
        number: "JOB-000100",
        createdAt: "2026-01-01T00:00:00.000Z",
        lastMessageAt: "2026-08-01T00:00:00.000Z",
      },
    ];
    const sorted = sortJobs(jobs, "recentlyUpdated", (j) => j);
    assert.deepEqual(sorted.map((j) => j.id), ["new-done-chat", "old-rework"]);
  });
});
