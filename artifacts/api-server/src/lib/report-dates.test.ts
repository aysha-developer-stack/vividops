import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatWorkDate,
  parseDateParam,
  resolveReportRange,
  shiftDateString,
  todayInTimezone,
} from "./report-dates.ts";

describe("report dates", () => {
  it("accepts YYYY-MM-DD only", () => {
    assert.equal(parseDateParam("2026-11-06"), "2026-11-06");
    assert.equal(parseDateParam("11/06/2026"), null);
    assert.equal(parseDateParam(""), null);
  });

  it("shifts calendar dates without timezone drift", () => {
    assert.equal(shiftDateString("2026-11-06", -30), "2026-10-07");
    assert.equal(shiftDateString("2026-03-01", -1), "2026-02-28");
  });

  it("keeps DATE objects on the same calendar day", () => {
    assert.equal(formatWorkDate("2026-11-06"), "2026-11-06");
    assert.equal(formatWorkDate("2026-11-06T19:00:00.000Z"), "2026-11-06");
    assert.equal(formatWorkDate(new Date("2026-11-06T00:00:00.000Z")), "2026-11-06");
  });

  it("defaults an omitted range to the last 30 calendar days in the report timezone", () => {
    const now = new Date("2026-11-06T08:00:00+05:00");
    const today = todayInTimezone("Asia/Karachi", now);
    assert.equal(today, "2026-11-06");
    const range = resolveReportRange({}, "Asia/Karachi");
    assert.equal(range.to, todayInTimezone("Asia/Karachi"));
    assert.equal(range.from, shiftDateString(range.to, -30));
  });
});
