import { describe, expect, it } from "vitest";
import { classifyAppointmentStatus } from "../src/classifier.js";
import type { DomSignals } from "../src/types.js";

const base: DomSignals = { pageHeadingPresent: true, calendarPresent: true, loadingVisible: false, noAppointmentsText: "", enabledDateCount: 0, availableTimeCount: 0, appointmentDates: [], errorText: "" };
describe("appointment classification", () => {
  it("prefers positive availability", () => expect(classifyAppointmentStatus({ ...base, enabledDateCount: 1, noAppointmentsText: "geen dagen beschikbaar" })).toBe("AVAILABLE"));
  it("recognizes the observed Dutch no-availability text", () => expect(classifyAppointmentStatus({ ...base, noAppointmentsText: "In augustus zijn er geen dagen beschikbaar" })).toBe("NOT_AVAILABLE"));
  it("fails closed on blank and loading pages", () => {
    expect(classifyAppointmentStatus(base)).toBe("PAGE_NOT_LOADED");
    expect(classifyAppointmentStatus({ ...base, loadingVisible: true, enabledDateCount: 2 })).toBe("PAGE_NOT_LOADED");
  });
  it("recognizes explicit page errors", () => expect(classifyAppointmentStatus({ ...base, errorText: "Er is iets misgegaan" })).toBe("ERROR"));
  it("does not infer availability from an otherwise complete but unknown state", () => {
    expect(classifyAppointmentStatus({ ...base, noAppointmentsText: "Kies een datum" })).toBe("PAGE_NOT_LOADED");
  });
});
