import { describe, expect, it, vi } from "vitest";
import { logMonitoringRoundComplete, runWithReloadedCustomers } from "../src/customers/CustomerCycle.js";
import { evaluateCustomers } from "../src/customers/CustomerMonitor.js";
import type { CustomerConfig } from "../src/customers/CustomerConfig.js";
import type { CustomersState } from "../src/customers/CustomerState.js";
import type { NotificationDraft } from "../src/notifications/Notification.js";

const now = new Date("2026-08-07T10:00:00.000Z");

function customer(overrides: Partial<CustomerConfig> = {}): CustomerConfig {
  return {
    id: "customer-a",
    service: "brp_existing_bsn",
    chatId: "chat-a",
    enabled: true,
    filter: { kind: "before", date: "2026-09-01" },
    expiresAt: "2026-09-07",
    ...overrides
  };
}

function harness() {
  const state: CustomersState = { customers: {} };
  const deliveries: Array<{ notification: NotificationDraft; chatId: string }> = [];
  const messages: string[] = [];
  const check = vi.fn().mockResolvedValue({
    status: "AVAILABLE" as const,
    appointmentDates: ["2026-08-20", "2026-09-10"]
  });
  const sender = {
    send: vi.fn(async (notification: NotificationDraft, chatId: string) => {
      deliveries.push({ notification, chatId });
    })
  };
  const log = { info: (message: string) => messages.push(message), error: (message: string) => messages.push(message) };
  const run = async (customers: readonly CustomerConfig[]) => {
    const result = await check();
    await evaluateCustomers({
      customers,
      state,
      status: result.status,
      appointmentDates: result.appointmentDates,
      now,
      timezone: "Europe/Amsterdam",
      isSimulation: true,
      sender,
      log
    });
  };
  return { state, deliveries, messages, check, sender, log, run };
}

describe("per-cycle customer configuration reload", () => {
  it("logs exactly one divider when a complete monitoring round finishes", () => {
    const messages: string[] = [];
    logMonitoringRoundComplete({ info: message => messages.push(message), error: message => messages.push(message) });
    expect(messages).toEqual(["----------------------------------------"]);
  });
  it("loads on every cycle and picks up a newly added customer", async () => {
    const context = harness();
    const configurations = [[customer()], [customer(), customer({ id: "customer-b", chatId: "chat-b" })]];
    const load = vi.fn(async () => configurations.shift() ?? []);
    await runWithReloadedCustomers({ load, run: context.run, log: context.log });
    await runWithReloadedCustomers({ load, run: context.run, log: context.log });
    expect(load).toHaveBeenCalledTimes(2);
    expect(context.state.customers).toHaveProperty("customer-b");
  });

  it("uses a changed filter on the next cycle", async () => {
    const context = harness();
    const configurations = [
      [customer()],
      [customer({ filter: { kind: "between", startDate: "2026-09-01", endDate: "2026-09-30" } })]
    ];
    await runWithReloadedCustomers({ load: async () => configurations.shift()!, run: context.run, log: context.log });
    await runWithReloadedCustomers({ load: async () => configurations.shift()!, run: context.run, log: context.log });
    expect(context.deliveries.map(delivery => delivery.notification.metadata?.earliestMatchingDate))
      .toEqual(["2026-08-20", "2026-09-10"]);
    expect(context.deliveries[1]?.notification.metadata?.filter).toBe("between 2026-09-01 and 2026-09-30");
  });

  it("applies enabled true to false on the next cycle", async () => {
    const context = harness();
    const configurations = [[customer()], [customer({ enabled: false })]];
    await runWithReloadedCustomers({ load: async () => configurations.shift()!, run: context.run, log: context.log });
    await runWithReloadedCustomers({ load: async () => configurations.shift()!, run: context.run, log: context.log });
    expect(context.sender.send).toHaveBeenCalledTimes(1);
  });

  it("uses a changed expiry date on the next cycle", async () => {
    const context = harness();
    const configurations = [[customer()], [customer({ expiresAt: "2026-08-06" })]];
    await runWithReloadedCustomers({ load: async () => configurations.shift()!, run: context.run, log: context.log });
    await runWithReloadedCustomers({ load: async () => configurations.shift()!, run: context.run, log: context.log });
    expect(context.deliveries.map(delivery => delivery.notification.metadata?.lifecycle ?? "appointment"))
      .toEqual(["appointment", "expiry"]);
  });

  it("uses a changed chat ID for the next notification", async () => {
    const context = harness();
    let cycle = 0;
    context.check.mockImplementation(async () => ({
      status: "AVAILABLE" as const,
      appointmentDates: cycle++ === 0 ? ["2026-08-20"] : ["2026-08-18"]
    }));
    const configurations = [[customer()], [customer({ chatId: "chat-new" })]];
    await runWithReloadedCustomers({ load: async () => configurations.shift()!, run: context.run, log: context.log });
    await runWithReloadedCustomers({ load: async () => configurations.shift()!, run: context.run, log: context.log });
    expect(context.deliveries.map(delivery => delivery.chatId)).toEqual(["chat-a", "chat-new"]);
  });

  it("fails closed without stale data or a check, keeps running, and recovers next cycle", async () => {
    const context = harness();
    const load = vi.fn()
      .mockResolvedValueOnce([customer()])
      .mockRejectedValueOnce(new Error("invalid configuration"))
      .mockResolvedValueOnce([customer({ id: "customer-b", chatId: "chat-b" })]);
    expect(await runWithReloadedCustomers({ load, run: context.run, log: context.log })).toBe("completed");
    expect(await runWithReloadedCustomers({ load, run: context.run, log: context.log })).toBe("skipped");
    expect(context.check).toHaveBeenCalledTimes(1);
    expect(context.state.customers).not.toHaveProperty("customer-b");
    expect(context.messages).toContain("Customer configuration reload failed: invalid configuration");
    expect(context.messages).toContain("Skipping customer monitoring cycle; will retry next cycle.");
    expect(await runWithReloadedCustomers({ load, run: context.run, log: context.log })).toBe("completed");
    expect(load).toHaveBeenCalledTimes(3);
    expect(context.check).toHaveBeenCalledTimes(2);
    expect(context.state.customers).toHaveProperty("customer-b");
  });

  it("performs exactly one check regardless of customer count", async () => {
    const context = harness();
    const customers = Array.from({ length: 50 }, (_, index) => customer({
      id: `customer-${index}`,
      chatId: `chat-${index}`,
      enabled: false
    }));
    await runWithReloadedCustomers({ load: async () => customers, run: context.run, log: context.log });
    expect(context.check).toHaveBeenCalledTimes(1);
  });
});
