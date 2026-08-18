import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { CustomerConfig } from "../src/customers/CustomerConfig.js";
import {
  activateCustomer,
  loadLifecycleCustomers,
  type LifecycleNotificationSender
} from "../src/customers/CustomerLifecycle.js";
import { evaluateCustomers } from "../src/customers/CustomerMonitor.js";
import type { CustomersState } from "../src/customers/CustomerState.js";

const now = new Date("2026-08-07T10:00:00.000Z");
const active: CustomerConfig = {
  id: "customer-a",
  service: "brp_existing_bsn",
  chatId: "private-chat-a",
  enabled: true,
  filter: { kind: "before", date: "2026-09-01" },
  expiresAt: "2026-08-14"
};

function activationSetup(customerOverrides: Partial<CustomerConfig> = {}) {
  const customer = { ...active, ...customerOverrides };
  const send = vi.fn<LifecycleNotificationSender["send"]>().mockResolvedValue(undefined);
  const messages: string[] = [];
  return {
    customer,
    send,
    messages,
    options: {
      customers: [customer],
      customerId: customer.id,
      now,
      timezone: "Europe/Amsterdam",
      isSimulation: false,
      sender: { send },
      log: { info: (message: string) => messages.push(message), error: (message: string) => messages.push(message) }
    }
  };
}

describe("customer activation", () => {
  it("sends only to the selected customer", async () => {
    const context = activationSetup();
    const other = { ...active, id: "customer-b", chatId: "private-chat-b" };
    context.options.customers.push(other);
    await activateCustomer(context.options);
    expect(context.send).toHaveBeenCalledTimes(1);
    expect(context.send.mock.calls[0]?.[1]).toBe("private-chat-a");
    expect(context.send.mock.calls[0]?.[0].message).toContain("Preference: on or before 2026-09-01");
  });

  it("fails for an unknown customer", async () => {
    const context = activationSetup();
    context.options.customerId = "missing-customer";
    await expect(activateCustomer(context.options)).rejects.toThrow("Unknown customer: missing-customer");
    expect(context.send).not.toHaveBeenCalled();
  });

  it("refuses an expired customer", async () => {
    const context = activationSetup({ expiresAt: "2026-08-06" });
    await expect(activateCustomer(context.options)).rejects.toThrow("monitoring has expired");
    expect(context.send).not.toHaveBeenCalled();
  });

  it("refuses a disabled customer", async () => {
    const context = activationSetup({ enabled: false });
    await expect(activateCustomer(context.options)).rejects.toThrow("is disabled");
    expect(context.send).not.toHaveBeenCalled();
  });

  it("never logs the chat ID", async () => {
    const context = activationSetup();
    await activateCustomer(context.options);
    expect(context.messages.join("\n")).not.toContain("private-chat-a");
  });

  it("labels simulation activation clearly", async () => {
    const context = activationSetup();
    context.options.isSimulation = true;
    await activateCustomer(context.options);
    expect(context.send.mock.calls[0]?.[0]).toMatchObject({ isSimulation: true });
    expect(context.send.mock.calls[0]?.[0].message).toContain("SIMULATION lifecycle notification");
  });
});

describe("lifecycle configuration isolation", () => {
  async function pathsWith(realId: string, simulationId: string) {
    const directory = await mkdtemp(path.join(tmpdir(), "appointment-lifecycle-"));
    const paths = {
      real: path.join(directory, "customers.json"),
      simulation: path.join(directory, "customers.simulation.json")
    };
    const raw = (id: string, chatId: string) => [{
      id, service: "brp_existing_bsn", chatId, enabled: true,
      filter: { type: "before", date: "2026-09-01" }, expiresAt: "2026-09-07"
    }];
    await writeFile(paths.real, JSON.stringify(raw(realId, "real-chat")), "utf8");
    await writeFile(paths.simulation, JSON.stringify(raw(simulationId, "simulation-chat")), "utf8");
    return paths;
  }

  it("simulation lifecycle cannot load real customers", async () => {
    const paths = await pathsWith("real-customer", "simulation-customer");
    expect((await loadLifecycleCustomers("simulation", paths)).map(customer => customer.id))
      .toEqual(["simulation-customer"]);
  });

  it("real lifecycle cannot load simulation customers", async () => {
    const paths = await pathsWith("real-customer", "simulation-customer");
    expect((await loadLifecycleCustomers("real", paths)).map(customer => customer.id))
      .toEqual(["real-customer"]);
  });
});

describe("customer expiry notifications", () => {
  function evaluationSetup(customers: CustomerConfig[]) {
    const state: CustomersState = { customers: {} };
    const send = vi.fn<LifecycleNotificationSender["send"]>().mockResolvedValue(undefined);
    const messages: string[] = [];
    return {
      state,
      send,
      messages,
      options: {
        customers,
        state,
        status: "AVAILABLE" as const,
        appointmentDates: ["2026-08-20"],
        now,
        timezone: "Europe/Amsterdam",
        url: "https://example.test/booking",
        isSimulation: false,
        sender: { send },
        log: { info: (message: string) => messages.push(message), error: (message: string) => messages.push(message) }
      }
    };
  }

  it("sends expiry exactly once and sends no appointment alert to the expired customer", async () => {
    const expired = { ...active, expiresAt: "2026-08-06" };
    const context = evaluationSetup([expired]);
    await evaluateCustomers(context.options);
    await evaluateCustomers(context.options);
    expect(context.send).toHaveBeenCalledTimes(1);
    expect(context.send.mock.calls[0]?.[0].metadata?.lifecycle).toBe("expiry");
    expect(context.state.customers[expired.id]?.expiryNotificationSent).toBe(true);
  });

  it("retries a failed expiry notification until it succeeds, then sends no more", async () => {
    const expired = { ...active, expiresAt: "2026-08-06" };
    const context = evaluationSetup([expired]);
    context.options.sender = {
      send: vi.fn()
        .mockRejectedValueOnce(new Error("Telegram unavailable"))
        .mockResolvedValue(undefined)
    };

    await evaluateCustomers(context.options);
    expect(context.options.sender.send).toHaveBeenCalledTimes(1);
    expect(context.state.customers[expired.id]).toMatchObject({
      status: "expired",
      expiryNotificationSent: false
    });

    await evaluateCustomers(context.options);
    expect(context.options.sender.send).toHaveBeenCalledTimes(2);
    expect(context.state.customers[expired.id]).toMatchObject({
      status: "expired",
      expiryNotificationSent: true
    });

    await evaluateCustomers(context.options);
    expect(context.options.sender.send).toHaveBeenCalledTimes(2);
  });

  it("a failed expiry delivery does not stop another customer's appointment alert", async () => {
    const expired = { ...active, expiresAt: "2026-08-06" };
    const other = { ...active, id: "customer-b", chatId: "private-chat-b" };
    const context = evaluationSetup([expired, other]);
    context.options.sender = {
      send: vi.fn(async (notification, chatId) => {
        if (chatId === expired.chatId) throw new Error("Telegram unavailable");
        await context.send(notification, chatId);
      })
    };
    const summary = await evaluateCustomers(context.options);
    expect(context.send).toHaveBeenCalledTimes(1);
    expect(context.send.mock.calls[0]?.[1]).toBe("private-chat-b");
    expect(summary).toMatchObject({ notificationsAttempted: 2, notificationsSent: 1, notificationsFailed: 1 });
    expect(context.state.customers[expired.id]?.expiryNotificationSent).toBe(false);
  });
});
