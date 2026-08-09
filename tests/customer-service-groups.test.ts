import { describe, expect, it, vi } from "vitest";
import type { CustomerConfig } from "../src/customers/CustomerConfig.js";
import { forEachActiveServiceGroup, groupActiveCustomersByService } from "../src/customers/CustomerServiceGroups.js";
import type { AppointmentServiceId } from "../src/appointmentServices.js";

const base: CustomerConfig = {
  id: "a", service: "brp_eu_eea_swiss_first_registration", chatId: "test-a", enabled: true,
  filter: { kind: "before", date: "2026-09-01" }, expiresAt: "2026-09-07"
};
const now = new Date("2026-08-09T10:00:00Z");

describe("customer service grouping", () => {
  it("groups same-service customers and separates different services", () => {
    const groups = groupActiveCustomersByService([
      base,
      { ...base, id: "b" },
      { ...base, id: "c", service: "brp_existing_bsn" }
    ], now, "Europe/Amsterdam");
    expect(groups.get("brp_eu_eea_swiss_first_registration")?.map(customer => customer.id)).toEqual(["a", "b"]);
    expect(groups.get("brp_existing_bsn")?.map(customer => customer.id)).toEqual(["c"]);
  });

  it("excludes disabled and expired customers from service checks", () => {
    const groups = groupActiveCustomersByService([
      { ...base, enabled: false },
      { ...base, id: "expired", expiresAt: "2026-08-08" }
    ], now, "Europe/Amsterdam");
    expect(groups.size).toBe(0);
  });

  it("checks once per service and evaluates every customer in that group", async () => {
    const groups = groupActiveCustomersByService([
      base, { ...base, id: "b" }, { ...base, id: "c", service: "brp_existing_bsn" }
    ], now, "Europe/Amsterdam");
    const check = vi.fn(async serviceId => ({ serviceId, dates: ["2026-08-20"] }));
    const evaluated: Array<{ serviceId: AppointmentServiceId; customerIds: string[] }> = [];
    const evaluate = vi.fn(async (serviceId: AppointmentServiceId, customers: readonly CustomerConfig[]) => {
      evaluated.push({ serviceId, customerIds: customers.map(customer => customer.id) });
    });
    await forEachActiveServiceGroup(groups, check, evaluate);
    expect(check).toHaveBeenCalledTimes(2);
    expect(check.mock.calls.map(call => call[0])).toEqual([
      "brp_eu_eea_swiss_first_registration", "brp_existing_bsn"
    ]);
    expect(evaluated).toEqual([
      { serviceId: "brp_eu_eea_swiss_first_registration", customerIds: ["a", "b"] },
      { serviceId: "brp_existing_bsn", customerIds: ["c"] }
    ]);
  });
});
