import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computePerformanceScore } from "./performanceScore.ts";

describe("computePerformanceScore", () => {
  it("is blank when the worker has no jobs", () => {
    const result = computePerformanceScore({
      jobCount: 0,
      completedCount: 0,
      completedOnTimeCount: 0,
      completedWithDueCount: 0,
      labeledReworkCount: 0,
    });
    assert.equal(result.score, 0);
    assert.match(result.tip, /No jobs assigned/);
  });

  it("does not treat missing due dates as late", () => {
    const result = computePerformanceScore({
      jobCount: 1,
      completedCount: 1,
      completedOnTimeCount: 0,
      completedWithDueCount: 0,
      labeledReworkCount: 0,
    });
    assert.equal(result.score, 100);
    assert.equal(Math.round(result.onTimeScore), 25);
  });

  it("uses only labeled rework, capped at 15 points", () => {
    const result = computePerformanceScore({
      jobCount: 2,
      completedCount: 1,
      completedOnTimeCount: 0,
      completedWithDueCount: 0,
      labeledReworkCount: 4,
    });
    assert.equal(Math.round(result.completionScore), 30);
    assert.equal(Math.round(result.reworkScore), 0);
    assert.equal(result.score, 55);
  });

  it("scores Fahad-style in-progress work as completion 0 plus unused rework points", () => {
    const result = computePerformanceScore({
      jobCount: 2,
      completedCount: 0,
      completedOnTimeCount: 0,
      completedWithDueCount: 0,
      labeledReworkCount: 0,
    });
    assert.equal(result.score, 15);
  });

  it("splits on-time only among jobs that have a due date", () => {
    const result = computePerformanceScore({
      jobCount: 3,
      completedCount: 2,
      completedOnTimeCount: 1,
      completedWithDueCount: 2,
      labeledReworkCount: 1,
    });
    assert.equal(Math.round(result.completionScore), 40);
    assert.equal(Math.round(result.onTimeScore), 13);
    assert.equal(Math.round(result.reworkScore), 8);
    assert.equal(result.score, 60);
  });
});
