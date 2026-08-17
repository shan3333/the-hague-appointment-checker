import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { CustomerConfig } from "../src/customers/CustomerConfig.js";
import { groupActiveCustomersByService } from "../src/customers/CustomerServiceGroups.js";
import { saveCustomersState, updateCustomersState, type CustomersState } from "../src/customers/CustomerState.js";
import { telegramCustomerKey } from "../src/customers/CustomerAlertIdentity.js";
import { handleTelegramCallback } from "../src/telegram-listener.js";

const customer: CustomerConfig = {
  id: "customer-001", service: "brp_existing_bsn", chatId: "12345", enabled: true,
  filter: { kind: "before", date: "2026-09-01" }, expiresAt: "2026-09-07"
};
const alertId = "a42abcde";

function setup(status: "active" | "booked" | "stopped" | "expired" = "active") {
  const state: CustomersState = { customers: { [customer.id]: {
    status, lastMatchingDates: [], lastCheckedAt: null, lastNotifiedAt: null,
    expiryNotificationSent: false,
    alerts: [{ alertId, sentAt: "2026-08-17T10:00:00.000Z", response: null, respondedAt: null }]
  } } };
  const api = { answerCallbackQuery: vi.fn(async () => {}), sendMessage: vi.fn(async () => {}) };
  const messages: string[] = [];
  const callback = (action: "b" | "n", chatId: string | number = customer.chatId) => ({
    id: "callback-1", data: `${action}:${telegramCustomerKey(customer.id)}:${alertId}`,
    message: { chat: { id: chatId } }
  });
  const run = (action: "b" | "n", chatId?: string | number) => handleTelegramCallback({
    callback: callback(action, chatId), customers: [customer], state, api,
    now: new Date("2026-08-17T11:00:00.000Z"),
    log: { info: message => messages.push(message), error: message => messages.push(message) }
  });
  return { state, api, messages, run };
}

describe("Telegram customer feedback", () => {
  it("marks an active customer booked and removes them from monitoring", async () => {
    const context = setup();
    expect(await context.run("b")).toBe("booked");
    expect(context.state.customers[customer.id]).toMatchObject({
      status: "booked", bookedAt: "2026-08-17T11:00:00.000Z"
    });
    expect(context.state.customers[customer.id]?.alerts?.[0]).toMatchObject({
      response: "booked", respondedAt: "2026-08-17T11:00:00.000Z"
    });
    expect(groupActiveCustomersByService([customer], new Date("2026-08-17T12:00:00Z"), "Europe/Amsterdam", context.state).size).toBe(0);
    expect(context.api.answerCallbackQuery).toHaveBeenCalledOnce();
  });

  it("records keep-looking and leaves the customer active", async () => {
    const context = setup();
    expect(await context.run("n")).toBe("keep-looking");
    expect(context.state.customers[customer.id]?.status).toBe("active");
    expect(context.state.customers[customer.id]?.alerts?.[0]?.response).toBe("keep-looking");
    expect(groupActiveCustomersByService([customer], new Date("2026-08-17T12:00:00Z"), "Europe/Amsterdam", context.state).size).toBe(1);
  });

  it("does not let the wrong chat update customer state", async () => {
    const context = setup();
    expect(await context.run("b", "99999")).toBe("unauthorized");
    expect(context.state.customers[customer.id]?.status).toBe("active");
    expect(context.api.sendMessage).not.toHaveBeenCalled();
  });

  it("handles duplicate booked callbacks safely", async () => {
    const context = setup();
    await context.run("b");
    await context.run("b");
    expect(context.state.customers[customer.id]?.alerts).toHaveLength(1);
    expect(context.state.customers[customer.id]?.bookedAt).toBe("2026-08-17T11:00:00.000Z");
    expect(context.api.sendMessage).toHaveBeenCalledOnce();
    expect(context.api.answerCallbackQuery).toHaveBeenCalledTimes(2);
  });

  it.each(["stopped", "expired"] as const)("handles an already %s customer gracefully", async status => {
    const context = setup(status);
    expect(await context.run("b")).toBe("inactive");
    expect(context.state.customers[customer.id]?.status).toBe(status);
    expect(context.api.answerCallbackQuery).toHaveBeenCalledOnce();
  });

  it("does not crash on malformed callback data", async () => {
    const context = setup();
    await expect(handleTelegramCallback({
      callback: { id: "bad", data: "not-json" }, customers: [customer], state: context.state,
      api: context.api, log: { info: vi.fn(), error: vi.fn() }
    })).resolves.toBe("malformed");
    expect(context.state.customers[customer.id]?.status).toBe("active");
  });

  it("keeps simulation/test state separate from real state", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "telegram-feedback-"));
    const realPath = path.join(directory, "customer-state.json");
    const simulationPath = path.join(directory, "simulation-customer-state.json");
    const real = setup().state;
    await saveCustomersState(realPath, real);
    await saveCustomersState(simulationPath, setup().state);
    await updateCustomersState(simulationPath, async state => {
      await handleTelegramCallback({
        callback: { id: "sim", data: `b:${telegramCustomerKey(customer.id)}:${alertId}`, message: { chat: { id: customer.chatId } } },
        customers: [customer], state, api: setup().api, now: new Date("2026-08-17T11:00:00Z"),
        log: { info: vi.fn(), error: vi.fn() }
      });
    });
    expect(JSON.parse(await readFile(realPath, "utf8")).customers[customer.id].status).toBe("active");
    expect(JSON.parse(await readFile(simulationPath, "utf8")).customers[customer.id].status).toBe("booked");
  });
});
