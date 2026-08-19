import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { buildCustomerAppointmentAlert } from "../src/customers/CustomerAppointmentAlert.js";
import { saveCustomersState, type CustomersState } from "../src/customers/CustomerState.js";
import { createNotification } from "../src/notifications/Notification.js";
import { TelegramNotifier } from "../src/notifications/TelegramNotifier.js";
import { buildTestAppointmentAlert, prepareTestNotificationState } from "../src/test-notification.js";
import { TEST_NOTIFICATION_CUSTOMER_ID, testNotificationCustomer } from "../src/test-notification-customer.js";
import { telegramCustomerKey } from "../src/customers/CustomerAlertIdentity.js";
import { resolveCallbackTarget } from "../src/telegram-listener.js";
import { config } from "../src/config.js";
import { buildStandaloneAppointmentAlert, prepareStandaloneAppointmentAlertState } from "../src/standalone-appointment-alert.js";
import {
  TELEGRAM_BOOKED_BUTTON_TEXT,
  TELEGRAM_KEEP_LOOKING_BUTTON_TEXT,
  telegramAppointmentFeedbackKeyboard
} from "../src/notifications/TelegramAppointmentFeedback.js";

describe("standalone production-style appointment notification", () => {
  const now = new Date("2026-08-17T10:00:00.000Z");
  const alertId = "a42abcde";

  it("uses the shared production appointment alert builder", () => {
    expect(buildTestAppointmentAlert(now, alertId, "", "Europe/Amsterdam")).toEqual(buildCustomerAppointmentAlert({
      customer: testNotificationCustomer(""),
      matchingDates: ["2026-08-24"],
      now,
      timezone: "Europe/Amsterdam",
      isSimulation: false,
      alertId
    }));
  });

  it("sends both compact production feedback callbacks", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await new TelegramNotifier("token", "test-chat", 1000, fetchFn).notify(
      createNotification(buildTestAppointmentAlert(now, alertId, "test-chat", "Europe/Amsterdam"))
    );
    const body = JSON.parse(String((fetchFn.mock.calls[0] as [string, RequestInit])[1].body));
    const buttons = body.reply_markup.inline_keyboard[0];
    expect(buttons.map((button: { text: string }) => button.text)).toEqual([
      TELEGRAM_BOOKED_BUTTON_TEXT,
      TELEGRAM_KEEP_LOOKING_BUTTON_TEXT
    ]);
    expect(buttons.map((button: { callback_data: string }) => button.callback_data)).toEqual([
      expect.stringMatching(/^b:[a-f0-9]{8}:a42abcde$/),
      expect.stringMatching(/^n:[a-f0-9]{8}:a42abcde$/)
    ]);
  });

  it("gives check:simulate AVAILABLE alerts both processable feedback buttons", async () => {
    const draft = buildStandaloneAppointmentAlert({
      matchingDates: ["2026-08-20"],
      now,
      timezone: "Europe/Amsterdam",
      chatId: "simulation-chat",
      isSimulation: true,
      filter: "NONE",
      alertId
    });
    const directory = await mkdtemp(path.join(os.tmpdir(), "check-simulate-alert-"));
    const statePath = path.join(directory, "test-notification-state.json");
    await prepareStandaloneAppointmentAlertState(statePath, draft);

    const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await new TelegramNotifier("token", "simulation-chat", 1000, fetchFn).notify(createNotification(draft));
    const body = JSON.parse(String((fetchFn.mock.calls[0] as [string, RequestInit])[1].body));
    expect(body.reply_markup).toEqual(
      telegramAppointmentFeedbackKeyboard(telegramCustomerKey(TEST_NOTIFICATION_CUSTOMER_ID), alertId)
    );
    expect(JSON.parse(await readFile(statePath, "utf8")).customers[TEST_NOTIFICATION_CUSTOMER_ID].alerts)
      .toEqual([expect.objectContaining({ alertId, response: null })]);
  });

  it("does not modify real customer state when sending", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "test-notification-state-"));
    const realStatePath = path.join(directory, "customer-state.json");
    const testStatePath = path.join(directory, "test-notification-state.json");
    const realState: CustomersState = { customers: { real: {
      status: "active", lastMatchingDates: [], lastCheckedAt: null, lastNotifiedAt: null,
      expiryNotificationSent: false
    } } };
    await saveCustomersState(realStatePath, realState);
    const before = await readFile(realStatePath, "utf8");
    const draft = buildTestAppointmentAlert(now, alertId, "test-chat", "Europe/Amsterdam");
    await prepareTestNotificationState(testStatePath, draft);
    const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await new TelegramNotifier("token", "test-chat", 1000, fetchFn).notify(createNotification(draft));
    expect(await readFile(realStatePath, "utf8")).toBe(before);
    expect(JSON.parse(await readFile(testStatePath, "utf8")).customers[TEST_NOTIFICATION_CUSTOMER_ID]).toMatchObject({
      status: "active", alerts: [{ alertId }]
    });
  });

  it("routes test callbacks to dedicated state without loading a real customer", async () => {
    const target = await resolveCallbackTarget(`b:${telegramCustomerKey(TEST_NOTIFICATION_CUSTOMER_ID)}:${alertId}`);
    expect(target.customers).toEqual([expect.objectContaining({ id: TEST_NOTIFICATION_CUSTOMER_ID })]);
    expect(target.statePath).toBe(config.testNotificationStatePath);
    expect(target.statePath).not.toBe(config.customerStatePath);
  });
});
