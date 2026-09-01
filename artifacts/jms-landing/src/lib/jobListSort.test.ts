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
  it("puts active jobs before done regardless of job number sort", () => {
    const jobs = [
      { id: "done-high", ...fields("Done", "JOB-999999", "2026-08-01T00:00:00.000Z") },
      { id: "rework-low", ...fields("Rework", "JOB-000100", "2026-01-01T00:00:00.000Z") },
      { id: "progress-mid", ...fields("In Progress", "JOB-000500", "2026-02-01T00:00:00.000Z") },
      { id: "pending-old", ...fields("Not Started", "JOB-000050", "2026-03-01T00:00:00.000Z") },
    ];

    const sorted = sortJobs(jobs, "jobNumber", (j) => j);
    assert.deepEqual(
      sorted.map((j) => j.id),
      ["rework-low", "progress-mid", "pending-old", "done-high"],
    );
  });

  it("sorts by created date within the same status on recent mode", () => {
    const jobs = [
      { id: "older", ...fields("In Progress", "JOB-000200", "2026-01-01T00:00:00.000Z") },
      { id: "newer", ...fields("In Progress", "JOB-000100", "2026-08-01T00:00:00.000Z") },
    ];

    const sorted = sortJobs(jobs, "recent", (j) => j);
    assert.deepEqual(sorted.map((j) => j.id), ["newer", "older"]);
  });
});
