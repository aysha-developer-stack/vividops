import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isInLocalWeek,
  isLocalCalendarDay,
  startOfLocalWeek,
  sumDurationsInLocalWeek,
  sumDurationsOnLocalDay,
} from "./timerTotals.ts";

describe("timer week / day totals", () => {
  const wednesday = new Date(2026, 10, 4, 15, 0, 0); // Wed 4 Nov 2026 local

  it("starts the week on Monday", () => {
    const start = startOfLocalWeek(wednesday);
    assert.equal(start.getDay(), 1);
    assert.equal(start.getDate(), 2);
    assert.equal(start.getHours(), 0);
  });

  it("counts only this week's logs, not older entries", () => {
    const entries = [
      { duration: 3600, createdAt: new Date(2026, 10, 3, 9, 0, 0) },
      { duration: 1800, createdAt: new Date(2026, 10, 4, 9, 0, 0) },
      { duration: 92 * 3600, createdAt: new Date(2026, 7, 26, 9, 0, 0) },
      { duration: 10 * 3600, createdAt: new Date(2026, 9, 21, 9, 0, 0) },
    ];
    assert.equal(sumDurationsInLocalWeek(entries, wednesday), 3600 + 1800);
  });

  it("counts today independently of this week", () => {
    const today = new Date(2026, 10, 4, 8, 0, 0);
    const yesterday = new Date(2026, 10, 3, 8, 0, 0);
    const entries = [
      { duration: 120, createdAt: today },
      { duration: 60, createdAt: yesterday },
    ];
    assert.equal(sumDurationsOnLocalDay(entries, wednesday), 120);
    assert.equal(isLocalCalendarDay(today, wednesday), true);
    assert.equal(isInLocalWeek(yesterday, wednesday), true);
  });
});
