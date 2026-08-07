import { describe, expect, it, vi } from "vitest";
import type { NotificationDraft } from "../src/notifications/Notification.js";
import {
  evaluateCustomers,
  logCustomerAvailability,
  logCustomerSummary,
  type CustomerNotificationSender
} from "../src/customers/CustomerMonitor.js";
import type { CustomerConfig } from "../src/customers/CustomerConfig.js";
import type { CustomersState } from "../src/customers/CustomerState.js";

const now = new Date("2026-08-07T10:00:00.000Z");
const customers: CustomerConfig[] = [
  { id: "customer-a", chatId: "chat-a", enabled: true, filter: { kind: "before", date: "2026-09-01" }, expiresAt: "2026-08-07" },
  { id: "customer-b", chatId: "chat-b", enabled: true, filter: { kind: "between", startDate: "2026-09-01", endDate: "2026-09-30" }, expiresAt: "2026-09-07" },
  { id: "customer-c", chatId: "chat-c", enabled: true, filter: { kind: "before", date: "2026-08-10" }, expiresAt: "2026-09-07" }
];

function setup(overrides: Partial<Parameters<typeof evaluateCustomers>[0]> = {}) {
  const deliveries: Array<{ notification: NotificationDraft; chatId: string }> = [];
  const sender: CustomerNotificationSender = {
    send: vi.fn(async (notification, chatId) => { deliveries.push({ notification, chatId }); })
  };
  const state: CustomersState = { customers: {} };
  const messages: string[] = [];
  const options: Parameters<typeof evaluateCustomers>[0] = {
    customers,
    state,
    status: "AVAILABLE",
    appointmentDates: ["2026-08-20", "2026-09-10", "2026-10-05"],
    now,
    timezone: "Europe/Amsterdam",
    url: "https://example.test/booking",
    isSimulation: true,
    sender,
    log: { info: message => messages.push(message), error: message => messages.push(message) },
    ...overrides
  };
  return { options, state, sender, deliveries, messages };
}

describe("multi-customer evaluation", () => {
  it("serves all customers from one checker invocation", async () => {
    const checker = vi.fn().mockResolvedValue({
      status: "AVAILABLE" as const,
      appointmentDates: ["2026-08-20", "2026-09-10", "2026-10-05"]
    });
    const result = await checker();
    const context = setup({ status: result.status, appointmentDates: result.appointmentDates });
    await evaluateCustomers(context.options);
    expect(checker).toHaveBeenCalledTimes(1);
    expect(context.deliveries.map(delivery => delivery.chatId)).toEqual(["chat-a", "chat-b"]);
  });

  it("uses one appointment result for different before, between, and no-match outcomes", async () => {
    const context = setup();
    logCustomerAvailability({
      status: context.options.status,
      appointmentDates: context.options.appointmentDates,
      isSimulation: false,
      log: context.options.log
    });
    const summary = await evaluateCustomers(context.options);
    expect(summary.notificationsSent).toBe(2);
    expect(context.deliveries.map(delivery => delivery.chatId)).toEqual(["chat-a", "chat-b"]);
    expect(context.deliveries[0]?.notification.metadata?.earliestMatchingDate).toBe("2026-08-20");
    expect(context.deliveries[1]?.notification.metadata?.earliestMatchingDate).toBe("2026-09-10");
    expect(context.deliveries[0]?.notification.message).not.toContain("customer-b");
    const output = context.messages.join("\n");
    expect(output.indexOf("Raw status: AVAILABLE")).toBeLessThan(output.indexOf("Customer customer-a"));
    expect(output).toContain("Available appointment dates: 2026-08-20, 2026-09-10, 2026-10-05");
    expect(output).toContain("Total available appointment dates: 3");
    expect(output).toContain("Customer customer-a");
    expect(output).toContain("  Filter: on or before 2026-09-01");
    expect(output).toContain("  Matching dates: 2026-08-20");
    expect(output).toContain("  Rejected dates: 2026-09-10, 2026-10-05");
    expect(output).toContain("  Earliest matching date: 2026-08-20");
    expect(output).toContain("  Previous matching dates: NONE");
    expect(output).toContain("  Matching dates changed: true");
    expect(output).toContain("  Notification: SENT");
    expect(output).not.toMatch(/chat-[abc]/);
    expect(output).not.toContain("secret-bot-token");
    expect(summary).toMatchObject({
      evaluated: 3,
      customersWithMatches: 2,
      notificationsAttempted: 2,
      notificationsSent: 2,
      notificationsFailed: 0
    });
    logCustomerSummary(summary, context.options.log);
    expect(context.messages.slice(-6)).toEqual([
      "Customer evaluation complete",
      "Active customers: 3",
      "Customers with matching appointments: 2",
      "Notifications attempted: 2",
      "Notifications succeeded: 2",
      "Notifications failed: 0"
    ]);
  });

  it("suppresses unchanged matches and resends changed or newly earlier matches", async () => {
    const context = setup({ customers: [customers[0]!] });
    await evaluateCustomers(context.options);
    await evaluateCustomers(context.options);
    expect(context.sender.send).toHaveBeenCalledTimes(1);
    context.options.appointmentDates = ["2026-08-18", "2026-08-20"];
    await evaluateCustomers(context.options);
    expect(context.sender.send).toHaveBeenCalledTimes(2);
  });

  it("sends after a no-match cycle and keeps customer states independent", async () => {
    const context = setup({ appointmentDates: [] });
    await evaluateCustomers(context.options);
    expect(context.sender.send).not.toHaveBeenCalled();
    context.options.appointmentDates = ["2026-08-20", "2026-09-10"];
    await evaluateCustomers(context.options);
    expect(context.deliveries.map(delivery => delivery.chatId)).toEqual(["chat-a", "chat-b"]);
    expect(context.state.customers["customer-a"]?.lastMatchingDates).toEqual(["2026-08-20"]);
    expect(context.state.customers["customer-b"]?.lastMatchingDates).toEqual(["2026-09-10"]);
  });

  it("continues with customer B when Telegram delivery for A fails", async () => {
    const context = setup();
    context.options.sender = {
      send: vi.fn(async (_notification, chatId) => {
        if (chatId === "chat-a") throw new Error("delivery failed for [REDACTED]");
        context.deliveries.push({ notification: _notification, chatId });
      })
    };
    const summary = await evaluateCustomers(context.options);
    expect(summary.notificationsSent).toBe(1);
    expect(summary.notificationsAttempted).toBe(2);
    expect(summary.notificationsFailed).toBe(1);
    expect(context.deliveries.map(delivery => delivery.chatId)).toEqual(["chat-b"]);
    expect(context.state.customers["customer-a"]?.lastMatchingDates).toEqual([]);
  });

  it("treats expiry as inclusive and skips expired and disabled customers", async () => {
    const context = setup({
      customers: [
        customers[0]!,
        { ...customers[1]!, id: "expired", expiresAt: "2026-08-06" },
        { ...customers[2]!, id: "disabled", enabled: false }
      ]
    });
    const summary = await evaluateCustomers(context.options);
    expect(summary).toMatchObject({ evaluated: 1, expired: 1, disabled: 1, notificationsSent: 1 });
    expect(context.messages).toContain("Customer expired monitoring expired.");
  });

  it("marks simulation messages and never changes notification decisions", async () => {
    const context = setup({ customers: [customers[0]!] });
    await evaluateCustomers(context.options);
    expect(context.deliveries[0]?.notification).toMatchObject({ isSimulation: true });
    expect(context.deliveries[0]?.notification.message).toContain("No real appointment website was checked");
  });

  it("logs NONE consistently when no dates match", async () => {
    const context = setup({ customers: [customers[2]!], appointmentDates: [] });
    logCustomerAvailability({
      status: "NOT_AVAILABLE",
      appointmentDates: [],
      isSimulation: false,
      log: context.options.log
    });
    await evaluateCustomers(context.options);
    const output = context.messages.join("\n");
    expect(output).toContain("Available appointment dates: NONE");
    expect(output).toContain("Total available appointment dates: 0");
    expect(output).toContain("  Matching dates: NONE");
    expect(output).toContain("  Rejected dates: NONE");
    expect(output).toContain("  Earliest matching date: NONE");
    expect(output).toContain("  Notification: NOT NEEDED");
  });

  it("clearly logs the dates belonging to the current simulation cycle", () => {
    const context = setup();
    logCustomerAvailability({
      status: "AVAILABLE",
      appointmentDates: ["2026-08-12", "2026-08-25", "2026-09-10"],
      isSimulation: true,
      simulationCheckNumber: 3,
      log: context.options.log
    });
    expect(context.messages).toEqual([
      "----------------------------------------",
      "Simulation check #3",
      "Raw status: AVAILABLE",
      "Available appointment dates:",
      "  2026-08-12",
      "  2026-08-25",
      "  2026-09-10",
      "Total available appointment dates: 3",
      "Evaluating customers...",
      "----------------------------------------"
    ]);
  });

  it("reuses within-filter calendar arithmetic for customer matches", async () => {
    const within: CustomerConfig = {
      id: "within",
      chatId: "within-chat",
      enabled: true,
      filter: { kind: "within", amount: 1, unit: "m", source: "1m" },
      expiresAt: "2026-09-07"
    };
    const context = setup({
      customers: [within],
      appointmentDates: ["2026-09-07", "2026-09-08"]
    });
    await evaluateCustomers(context.options);
    expect(context.deliveries).toHaveLength(1);
    expect(context.deliveries[0]?.notification.metadata?.earliestMatchingDate).toBe("2026-09-07");
    expect(context.state.customers.within?.lastMatchingDates).toEqual(["2026-09-07"]);
  });
});
