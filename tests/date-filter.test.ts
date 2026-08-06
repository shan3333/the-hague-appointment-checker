import { describe, expect, it } from "vitest";
import {
  calculateDateRange,
  evaluateDateFilter,
  filterAppointmentsByDateRange,
  parseDateFilterArgs,
  parseWithinDuration,
  selectSimulationDates
} from "../src/dateFilter.js";

const zone = "Europe/Amsterdam";
const reference = new Date("2026-08-06T10:00:00Z");

describe("date-filter argument parsing", () => {
  it("supports no filter", () => expect(parseDateFilterArgs([])).toBeUndefined());
  it("parses days, weeks, and months", () => {
    expect(parseWithinDuration("7d")).toMatchObject({ amount: 7, unit: "d" });
    expect(parseWithinDuration("1w")).toMatchObject({ amount: 1, unit: "w" });
    expect(parseWithinDuration("1m")).toMatchObject({ amount: 1, unit: "m" });
  });
  it.each(["abc", "-7d", "1y"])("rejects invalid duration %s", value => {
    expect(() => parseWithinDuration(value)).toThrow(/--within/);
  });
  it("rejects zero duration", () => expect(() => parseWithinDuration("0d")).toThrow(/greater than zero/));
  it.each(["invalid-date", "2026-02-30"])("rejects invalid ISO date %s", value => {
    expect(() => parseDateFilterArgs(["--before", value])).toThrow(/valid date/);
  });
  it("rejects both filters", () => {
    expect(() => parseDateFilterArgs(["--within", "7d", "--before", "2026-09-01"]))
      .toThrow(/Only one/);
  });
  it("parses an inclusive between filter", () => {
    expect(parseDateFilterArgs(["--between", "2026-08-15", "2026-09-01"]))
      .toEqual({ kind: "between", startDate: "2026-08-15", endDate: "2026-09-01" });
  });
  it.each([
    [["--between", "bad", "2026-09-01"], /start date/],
    [["--between", "2026-08-15", "bad"], /end date/],
    [["--between", "2026-02-30", "2026-09-01"], /start date/],
    [["--between", "2026-08-15"], /start date and an end date/],
    [["--between"], /start date and an end date/]
  ])("rejects invalid between arguments %#", (args, message) => {
    expect(() => parseDateFilterArgs(args as string[])).toThrow(message as RegExp);
  });
  it("rejects a reversed between range", () => {
    expect(() => parseDateFilterArgs(["--between", "2026-09-01", "2026-08-15"]))
      .toThrow(/start date must be on or before end date/);
  });
  it.each([
    ["--within", "7d"],
    ["--before", "2026-10-01"]
  ])("rejects between combined with %s", (option, value) => {
    expect(() => parseDateFilterArgs(["--between", "2026-08-15", "2026-09-01", option, value]))
      .toThrow(/Only one/);
  });
  it.each(["--within", "--before"])("rejects a missing value after %s", option => {
    expect(() => parseDateFilterArgs([option])).toThrow(/requires a value/);
  });
});

describe("simulation appointment dates", () => {
  const sequence = [["2026-09-10"], ["2026-08-10"], []] as const;
  it("supports an outside-to-inside-to-no-match timeline", () => {
    expect(selectSimulationDates([], sequence, 1, true)).toEqual(["2026-09-10"]);
    expect(selectSimulationDates([], sequence, 2, true)).toEqual(["2026-08-10"]);
    expect(selectSimulationDates([], sequence, 3, true)).toEqual([]);
  });
  it("moves from outside to inside to after a between range", () => {
    const dates = [["2026-08-10"], ["2026-08-20", "2026-08-25"], ["2026-09-10"]] as const;
    const between = calculateDateRange(reference, parseDateFilterArgs([
      "--between", "2026-08-15", "2026-09-01"
    ]), zone);
    const statuses = dates.map((_, index) => evaluateDateFilter(
      "AVAILABLE",
      selectSimulationDates([], dates, index + 1, false),
      between,
      true
    ).status);
    expect(statuses).toEqual(["NOT_AVAILABLE", "AVAILABLE", "NOT_AVAILABLE"]);
  });
  it("repeats or stays on the final cycle as configured", () => {
    expect(selectSimulationDates([], sequence, 4, true)).toEqual(["2026-09-10"]);
    expect(selectSimulationDates([], sequence, 4, false)).toEqual([]);
  });
});

describe("date-only range calculation", () => {
  it("uses today as an inclusive unbounded start without a filter", () => {
    expect(calculateDateRange(reference, undefined, zone)).toEqual({ start: "2026-08-06", end: null, today: "2026-08-06" });
  });
  it("calculates inclusive day and week ranges", () => {
    expect(calculateDateRange(reference, parseWithinDuration("7d"), zone).end).toBe("2026-08-13");
    expect(calculateDateRange(reference, parseWithinDuration("1w"), zone).end).toBe("2026-08-13");
  });
  it("adds a calendar month and clamps January 31", () => {
    const january31 = new Date("2026-01-31T12:00:00Z");
    expect(calculateDateRange(january31, parseWithinDuration("1m"), zone).end).toBe("2026-02-28");
  });
  it("handles leap-year and non-leap-year February", () => {
    expect(calculateDateRange(new Date("2024-01-31T12:00:00Z"), parseWithinDuration("1m"), zone).end)
      .toBe("2024-02-29");
    expect(calculateDateRange(new Date("2025-01-31T12:00:00Z"), parseWithinDuration("1m"), zone).end)
      .toBe("2025-02-28");
  });
  it("treats --before as inclusive", () => {
    const filter = parseDateFilterArgs(["--before", "2026-09-01"]);
    expect(calculateDateRange(reference, filter, zone)).toEqual({ start: "2026-08-06", end: "2026-09-01", today: "2026-08-06" });
  });
  it("uses the configured timezone rather than the UTC date", () => {
    const nearMidnight = new Date("2026-08-05T22:30:00Z");
    expect(calculateDateRange(nearMidnight, parseWithinDuration("7d"), zone).start).toBe("2026-08-06");
  });
});

describe("appointment filtering", () => {
  const range = calculateDateRange(reference, parseWithinDuration("7d"), zone);
  it("includes today and the inclusive end date", () => {
    expect(filterAppointmentsByDateRange(["2026-08-06", "2026-08-13"], range))
      .toEqual(["2026-08-06", "2026-08-13"]);
  });
  it("rejects dates before today and one day after the end", () => {
    expect(filterAppointmentsByDateRange(["2026-08-05", "2026-08-14"], range)).toEqual([]);
  });
  it("selects and sorts only matching dates", () => {
    expect(filterAppointmentsByDateRange(["2026-08-20", "2026-08-10", "2026-08-07"], range))
      .toEqual(["2026-08-07", "2026-08-10"]);
  });
  it("makes out-of-range availability non-matching", () => {
    expect(evaluateDateFilter("AVAILABLE", ["2026-09-10"], range, true).status).toBe("NOT_AVAILABLE");
  });
  it("applies both inclusive between boundaries and rejects adjacent dates", () => {
    const between = parseDateFilterArgs(["--between", "2026-08-15", "2026-09-01"]);
    const betweenRange = calculateDateRange(reference, between, zone);
    expect(filterAppointmentsByDateRange([
      "2026-08-14", "2026-08-15", "2026-08-20", "2026-09-01", "2026-09-02"
    ], betweenRange)).toEqual(["2026-08-15", "2026-08-20", "2026-09-01"]);
  });
  it("supports a same-day between range", () => {
    const sameDay = calculateDateRange(reference, parseDateFilterArgs([
      "--between", "2026-08-20", "2026-08-20"
    ]), zone);
    expect(filterAppointmentsByDateRange(["2026-08-19", "2026-08-20", "2026-08-21"], sameDay))
      .toEqual(["2026-08-20"]);
  });
  it("classifies between rejection reasons and ignores past dates", () => {
    const between = calculateDateRange(reference, parseDateFilterArgs([
      "--between", "2026-08-15", "2026-09-01"
    ]), zone);
    const result = evaluateDateFilter("AVAILABLE", [
      "2026-08-05", "2026-08-10", "2026-08-20", "2026-09-10"
    ], between, true);
    expect(result.matchingDates).toEqual(["2026-08-20"]);
    expect(result.rejectedPastDates).toEqual(["2026-08-05"]);
    expect(result.rejectedBeforeStart).toEqual(["2026-08-10"]);
    expect(result.rejectedAfterEnd).toEqual(["2026-09-10"]);
  });
  it("keeps date-only between comparisons stable near an Amsterdam date boundary", () => {
    const nearMidnight = new Date("2026-08-05T22:30:00Z");
    const between = calculateDateRange(nearMidnight, parseDateFilterArgs([
      "--between", "2026-08-06", "2026-08-06"
    ]), zone);
    expect(filterAppointmentsByDateRange(["2026-08-05", "2026-08-06"], between))
      .toEqual(["2026-08-06"]);
  });
  it("preserves legacy undated availability when no explicit filter is supplied", () => {
    expect(evaluateDateFilter("AVAILABLE", [], range, false).status).toBe("AVAILABLE");
  });
});
