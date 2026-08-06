import { describe, expect, it } from "vitest";
import { emptyState, matchingDatesChanged, nextState, shouldNotify } from "../src/state.js";

describe("notification policy", () => {
  const now = new Date("2026-08-05T10:00:00Z");
  const notificationsFor = (statuses: Array<"AVAILABLE" | "NOT_AVAILABLE">): boolean[] =>
    statuses.map(shouldNotify);

  it("AVAILABLE -> AVAILABLE notifies on both cycles", () => {
    expect(notificationsFor(["AVAILABLE", "AVAILABLE"])).toEqual([true, true]);
  });
  it("NOT_AVAILABLE -> AVAILABLE -> AVAILABLE sends two notifications", () => {
    expect(notificationsFor(["NOT_AVAILABLE", "AVAILABLE", "AVAILABLE"])).toEqual([false, true, true]);
  });
  it("AVAILABLE -> NOT_AVAILABLE notifies only on the first cycle", () => {
    expect(notificationsFor(["AVAILABLE", "NOT_AVAILABLE"])).toEqual([true, false]);
  });
  it("NOT_AVAILABLE -> NOT_AVAILABLE sends no notifications", () => {
    expect(notificationsFor(["NOT_AVAILABLE", "NOT_AVAILABLE"])).toEqual([false, false]);
  });
  it("preserves definitive status across failed loads", () => {
    const prior = { ...emptyState, lastDefinitiveStatus: "NOT_AVAILABLE" as const };
    expect(nextState(prior, "PAGE_NOT_LOADED", now, false).lastDefinitiveStatus).toBe("NOT_AVAILABLE");
  });
  it("does not report unchanged matching dates as changed", () => {
    const prior = { ...emptyState, lastMatchingAppointmentDates: ["2026-08-10"] };
    expect(matchingDatesChanged(prior, ["2026-08-10"])).toBe(false);
  });
  it("records a transition from no match to match", () => {
    const state = nextState(emptyState, "AVAILABLE", now, true, {
      rawStatus: "AVAILABLE",
      availableDates: ["2026-08-10"],
      matchingDates: ["2026-08-10"]
    });
    expect(matchingDatesChanged(emptyState, state.lastMatchingAppointmentDates)).toBe(true);
    expect(state.lastDefinitiveStatus).toBe("AVAILABLE");
  });
  it("records a transition from match to no match", () => {
    const prior = { ...emptyState, lastDefinitiveStatus: "AVAILABLE" as const, lastMatchingAppointmentDates: ["2026-08-10"] };
    const state = nextState(prior, "NOT_AVAILABLE", now, false, {
      rawStatus: "AVAILABLE",
      availableDates: ["2026-09-10"],
      matchingDates: []
    });
    expect(matchingDatesChanged(prior, state.lastMatchingAppointmentDates)).toBe(true);
    expect(state.lastRawStatus).toBe("AVAILABLE");
    expect(state.lastDefinitiveStatus).toBe("NOT_AVAILABLE");
  });
});
