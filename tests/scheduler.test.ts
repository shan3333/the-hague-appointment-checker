import { describe, expect, it } from "vitest";
import { isWithinSchedule } from "../src/scheduler.js";

const schedule = { timezone: "Europe/Amsterdam", monitorDays: [1,2,3,4,5], startHour: 8, endHour: 22 };
describe("schedule window", () => {
  it("uses Amsterdam local weekday and inclusive hours", () => {
    expect(isWithinSchedule(new Date("2026-08-05T06:00:00Z"), schedule)).toBe(true);
    expect(isWithinSchedule(new Date("2026-08-05T21:00:00Z"), schedule)).toBe(false);
    expect(isWithinSchedule(new Date("2026-08-08T10:00:00Z"), schedule)).toBe(false);
  });
});
