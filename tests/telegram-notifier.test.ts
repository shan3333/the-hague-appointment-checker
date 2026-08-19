import { describe, expect, it, vi } from "vitest";
import { TelegramNotifier, formatTelegramMessage } from "../src/notifications/TelegramNotifier.js";
import type { Notification } from "../src/notifications/Notification.js";
import { telegramAppointmentFeedbackKeyboard } from "../src/notifications/TelegramAppointmentFeedback.js";

const notification: Notification = {
  title: "The Hague appointment available",
  message: "A selectable appointment was detected.",
  isSimulation: false,
  url: "https://denhaag.mijnafspraakmaken.nl/?product=35",
  timestamp: "2026-08-06T15:20:00.000Z",
  metadata: {
    earliestMatchingDate: "2026-08-10",
    matchingAppointmentCount: 2,
    filter: "between 2026-08-10 and 2026-08-20",
    timezone: "Europe/Amsterdam"
  }
};

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("TelegramNotifier", () => {
  it("sends the expected concise message", async () => {
    const fetchFn = vi.fn().mockResolvedValue(response({ ok: true }));
    const notifier = new TelegramNotifier("secret-token", "chat-id", 1000, fetchFn);
    await notifier.notify(notification);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("secret-token");
    const body = JSON.parse(String(init.body));
    expect(body.chat_id).toBe("chat-id");
    expect(body.text).toBe(formatTelegramMessage(notification));
    expect(body.text).toContain("2026-08-06 17:20 Europe/Amsterdam");
  });

  it("clearly labels simulated notifications and keeps appointment details", () => {
    const message = formatTelegramMessage({
      ...notification,
      title: "🧪 Simulation: The Hague Appointment Available",
      message: "This is a simulated appointment notification. No real appointment website was checked. No booking was attempted.",
      isSimulation: true
    });
    expect(message).toContain("🧪 SIMULATION");
    expect(message).toContain("This is a simulated appointment notification.");
    expect(message).toContain("No real appointment website was checked.");
    expect(message).toContain("No booking was attempted.");
    expect(message).toContain("Earliest matching appointment\n2026-08-10");
    expect(message).toContain("Filter\nbetween 2026-08-10 and 2026-08-20");
    expect(message).toContain("Booking URL (for reference only)\nhttps://denhaag.mijnafspraakmaken.nl/?product=35");
  });

  it("keeps real notification wording unchanged", () => {
    const message = formatTelegramMessage(notification);
    expect(message).toContain("🎉 The Hague appointment available");
    expect(message).toContain("Open booking page\nhttps://denhaag.mijnafspraakmaken.nl/?product=35");
    expect(message).not.toContain("SIMULATION");
    expect(message).not.toContain("reference only");
  });

  it("reports an HTTP error without exposing the token", async () => {
    const notifier = new TelegramNotifier("secret-token", "chat-id", 1000, vi.fn().mockResolvedValue(response({}, 500)));
    await expect(notifier.notify(notification)).rejects.toThrow("Telegram HTTP error 500");
    await expect(notifier.notify(notification)).rejects.not.toThrow("secret-token");
  });

  it("sends to an explicitly selected customer destination", async () => {
    const fetchFn = vi.fn().mockResolvedValue(response({ ok: true }));
    const notifier = new TelegramNotifier("secret-token", "default-chat", 1000, fetchFn);
    await notifier.notify(notification, "customer-chat");
    const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body)).chat_id).toBe("customer-chat");
  });

  it("adds compact booking feedback buttons to real customer alerts", async () => {
    const fetchFn = vi.fn().mockResolvedValue(response({ ok: true }));
    const notifier = new TelegramNotifier("token", "chat", 1000, fetchFn);
    await notifier.notify({ ...notification, metadata: { ...notification.metadata, telegramCustomerKey: "c001abcd", alertId: "a42abcde" } });
    const body = JSON.parse(String((fetchFn.mock.calls[0] as [string, RequestInit])[1].body));
    expect(body.reply_markup).toEqual(telegramAppointmentFeedbackKeyboard("c001abcd", "a42abcde"));
  });

  it("adds the same feedback buttons to simulated customer alerts", async () => {
    const fetchFn = vi.fn().mockResolvedValue(response({ ok: true }));
    const notifier = new TelegramNotifier("token", "chat", 1000, fetchFn);
    await notifier.notify({
      ...notification,
      isSimulation: true,
      metadata: { ...notification.metadata, telegramCustomerKey: "c001abcd", alertId: "a42abcde" }
    });
    const body = JSON.parse(String((fetchFn.mock.calls[0] as [string, RequestInit])[1].body));
    expect(body.reply_markup).toEqual(telegramAppointmentFeedbackKeyboard("c001abcd", "a42abcde"));
  });

  it("reports network failure", async () => {
    const notifier = new TelegramNotifier("token", "chat", 1000, vi.fn().mockRejectedValue(new Error("network down")));
    await expect(notifier.notify(notification)).rejects.toThrow("network down");
  });

  it("reports Telegram API errors", async () => {
    const notifier = new TelegramNotifier("token", "private-chat-id", 1000, vi.fn().mockResolvedValue(response({ ok: false, description: "chat not found" })));
    await expect(notifier.notify(notification)).rejects.toThrow("Telegram API error: chat not found");
  });

  it("rejects malformed responses", async () => {
    const notifier = new TelegramNotifier("token", "chat", 1000, vi.fn().mockResolvedValue(response({ result: true })));
    await expect(notifier.notify(notification)).rejects.toThrow("malformed response");
  });

  it("times out", async () => {
    const fetchFn = vi.fn((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }));
    const notifier = new TelegramNotifier("token", "chat", 5, fetchFn as typeof fetch);
    await expect(notifier.notify(notification)).rejects.toThrow("timed out after 5ms");
  });
});
