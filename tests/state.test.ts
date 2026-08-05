import { describe, expect, it } from "vitest";
import { emptyState, nextState, shouldNotify } from "../src/state.js";

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
});
