import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { CustomerConfig } from "../src/customers/CustomerConfig.js";
import { updateCustomerStatus } from "../src/customers/CustomerAdmin.js";
import { groupActiveCustomersByService } from "../src/customers/CustomerServiceGroups.js";
import { loadCustomersState, saveCustomersState, type CustomersState } from "../src/customers/CustomerState.js";
import { parseCustomerStatusArgs } from "../src/customer-status.js";

const now = new Date("2026-08-17T10:00:00.000Z");
const customer = (id: string): CustomerConfig => ({
  id, service: "brp_existing_bsn", chatId: `${id}-chat`, enabled: true,
  filter: { kind: "before", date: "2026-09-01" }, expiresAt: "2026-09-07"
});

async function setup() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "customer-admin-"));
  const realFile = path.join(directory, "customer-state.json");
  const simulationFile = path.join(directory, "simulation-customer-state.json");
  const testFile = path.join(directory, "test-notification-state.json");
  const alerts = [{ alertId: "a42abcde", sentAt: "2026-08-16T10:00:00Z", response: "keep-looking" as const, respondedAt: "2026-08-16T10:05:00Z" }];
  const real: CustomersState = { customers: {
    a: { status: "active", activatedAt: "2026-08-01T10:00:00Z", lastMatchingDates: ["2026-08-20"], lastCheckedAt: "preserve", lastNotifiedAt: "preserve", expiryNotificationSent: false, alerts },
    b: { status: "active", lastMatchingDates: [], lastCheckedAt: null, lastNotifiedAt: null, expiryNotificationSent: false }
  } };
  const disposable: CustomersState = { customers: { sentinel: { status: "booked", bookedAt: "preserve", lastMatchingDates: [], lastCheckedAt: null, lastNotifiedAt: null, expiryNotificationSent: false } } };
  await saveCustomersState(realFile, real);
  await saveCustomersState(simulationFile, disposable);
  await saveCustomersState(testFile, disposable);
  return { directory, realFile, simulationFile, testFile, customers: [customer("a"), customer("b")] };
}

async function contents(file: string): Promise<string> {
  return readFile(file, "utf8");
}

describe("customer-specific administration", () => {
  it("marks one active customer booked, timestamps it, preserves history, and excludes it", async () => {
    const context = await setup();
    const otherBefore = (await loadCustomersState(context.realFile)).customers.b;
    await expect(updateCustomerStatus({
      customers: context.customers, customerId: "a", action: "booked", stateFile: context.realFile,
      now, timezone: "Europe/Amsterdam"
    })).resolves.toBe("changed");
    const state = await loadCustomersState(context.realFile);
    expect(state.customers.a).toMatchObject({
      status: "booked", bookedAt: now.toISOString(), statusSource: "manual",
      activatedAt: "2026-08-01T10:00:00Z", alerts: [{ alertId: "a42abcde", response: "keep-looking" }]
    });
    expect(state.customers.b).toEqual(otherBefore);
    expect(groupActiveCustomersByService(context.customers, now, "Europe/Amsterdam", state).get("brp_existing_bsn")?.map(value => value.id)).toEqual(["b"]);
  });

  it("marks one active customer stopped without classifying it as booked", async () => {
    const context = await setup();
    await expect(updateCustomerStatus({
      customers: context.customers, customerId: "a", action: "stop", stateFile: context.realFile,
      now, timezone: "Europe/Amsterdam"
    })).resolves.toBe("changed");
    const state = await loadCustomersState(context.realFile);
    expect(state.customers.a).toMatchObject({ status: "stopped", stoppedAt: now.toISOString(), statusSource: "manual" });
    expect(state.customers.a?.bookedAt).toBeUndefined();
    expect(state.customers.a?.alerts).toHaveLength(1);
    expect(groupActiveCustomersByService(context.customers, now, "Europe/Amsterdam", state).get("brp_existing_bsn")?.map(value => value.id)).toEqual(["b"]);
  });

  it.each(["booked", "stop"] as const)("is idempotent for duplicate %s operations", async action => {
    const context = await setup();
    const options = { customers: context.customers, customerId: "a", action, stateFile: context.realFile, now, timezone: "Europe/Amsterdam" };
    await updateCustomerStatus(options);
    const first = await loadCustomersState(context.realFile);
    await expect(updateCustomerStatus({ ...options, now: new Date("2026-08-18T10:00:00Z") })).resolves.toBe("already-applied");
    expect(await loadCustomersState(context.realFile)).toEqual(first);
  });

  it("rejects unknown and expired customers without creating or changing state", async () => {
    const context = await setup();
    const before = await contents(context.realFile);
    await expect(updateCustomerStatus({
      customers: context.customers, customerId: "missing", action: "booked", stateFile: context.realFile,
      now, timezone: "Europe/Amsterdam"
    })).rejects.toThrow("Unknown customer: missing");
    await expect(updateCustomerStatus({
      customers: [{ ...context.customers[0]!, expiresAt: "2026-08-16" }], customerId: "a", action: "stop",
      stateFile: context.realFile, now, timezone: "Europe/Amsterdam"
    })).rejects.toThrow("monitoring has expired");
    expect(await contents(context.realFile)).toBe(before);
  });

  it("never changes simulation or test state", async () => {
    const context = await setup();
    const simulationBefore = await contents(context.simulationFile);
    const testBefore = await contents(context.testFile);
    await updateCustomerStatus({ customers: context.customers, customerId: "a", action: "stop", stateFile: context.realFile, now, timezone: "Europe/Amsterdam" });
    expect(await contents(context.simulationFile)).toBe(simulationBefore);
    expect(await contents(context.testFile)).toBe(testBefore);
  });

  it("fails clearly when the customer ID is missing", () => {
    expect(() => parseCustomerStatusArgs(["booked"])).toThrow("Customer ID is required");
    expect(() => parseCustomerStatusArgs(["stop", ""])).toThrow("Customer ID is required");
  });
});
