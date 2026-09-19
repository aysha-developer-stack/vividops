export function clampScore(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export type PerformanceScoreInput = {
  jobCount: number;
  completedCount: number;
  /** Completed jobs that have a due date and were finished on or before it. */
  completedOnTimeCount: number;
  /** Completed jobs that have a due date. Missing due dates are not treated as late. */
  completedWithDueCount: number;
  /** Internal + external rework events only (not supervisor QC loops). */
  labeledReworkCount: number;
};

export type PerformanceScoreResult = {
  score: number;
  tip: string;
  completionScore: number;
  onTimeScore: number;
  reworkScore: number;
};

/**
 * Worker performance out of 100:
 *  60 completion (finished jobs / assigned jobs)
 *  25 on-time (among completed jobs that have a due date)
 *  15 low rework (internal + external vs completed work)
 */
export function computePerformanceScore(input: PerformanceScoreInput): PerformanceScoreResult {
  const jobCount = Math.max(0, input.jobCount);
  const completedCount = Math.max(0, input.completedCount);
  const completedWithDueCount = Math.max(0, input.completedWithDueCount);
  const completedOnTimeCount = Math.max(0, Math.min(input.completedOnTimeCount, completedWithDueCount));
  const labeledReworkCount = Math.max(0, input.labeledReworkCount);

  if (jobCount === 0) {
    return {
      score: 0,
      tip: "No jobs assigned in this period",
      completionScore: 0,
      onTimeScore: 0,
      reworkScore: 0,
    };
  }

  const completionScore = (completedCount / jobCount) * 60;
  const onTimeRate =
    completedWithDueCount > 0
      ? completedOnTimeCount / completedWithDueCount
      : completedCount > 0
        ? 1
        : 0;
  const onTimeScore = onTimeRate * 25;
  const reworkBase = completedCount > 0 ? completedCount : jobCount;
  const reworkRate = reworkBase > 0 ? labeledReworkCount / reworkBase : 0;
  const reworkScore = (1 - clampScore(reworkRate, 0, 1)) * 15;
  const score = Math.round(clampScore(completionScore + onTimeScore + reworkScore, 0, 100));

  return {
    score,
    tip: `Completion ${Math.round(completionScore)}/60 · On-time ${Math.round(onTimeScore)}/25 · Low rework ${Math.round(reworkScore)}/15`,
    completionScore,
    onTimeScore,
    reworkScore,
  };
}
