import { describe, expect, it } from "vitest";
import { APPOINTMENT_SERVICES, getAppointmentService } from "../src/appointmentServices.js";

describe("appointment services", () => {
  it.each([
    ["brp_existing_bsn", 35],
    ["brp_dutch_first_registration", 27],
    ["brp_eu_eea_swiss_first_registration", 28],
    ["brp_residence_permit_first_registration", 30]
  ] as const)("resolves %s to product %s", (id, productId) => {
    const service = getAppointmentService(id);
    expect(service.productId).toBe(productId);
    expect(service.bookingUrl).toBe(`https://denhaag.mijnafspraakmaken.nl/?product=${productId}`);
    expect(APPOINTMENT_SERVICES[id]).toBe(service);
  });

  it("rejects unsupported IDs", () => {
    expect(() => getAppointmentService("foo")).toThrow('Unsupported appointment service "foo"');
  });
});
