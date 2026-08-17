import { DateTime } from "luxon";
import type { Notification } from "./Notification.js";
import type { NotificationProvider } from "./NotificationProvider.js";

export type TelegramFetch = typeof fetch;

interface TelegramResponse {
  ok: boolean;
  description?: string;
}

function redact(value: string, secrets: readonly string[]): string {
  return secrets.filter(Boolean).reduce((safe, secret) => safe.replaceAll(secret, "[REDACTED]"), value);
}

function formatDetectedAt(notification: Notification): string {
  const timezone = typeof notification.metadata.timezone === "string"
    ? notification.metadata.timezone
    : "Europe/Amsterdam";
  const detected = DateTime.fromISO(notification.timestamp).setZone(timezone);
  return detected.isValid
    ? `${detected.toFormat("yyyy-MM-dd HH:mm")} ${timezone}`
    : notification.timestamp;
}

export function formatTelegramMessage(notification: Notification): string {
  const heading = notification.isSimulation ? "🧪 SIMULATION" : `🎉 ${notification.title}`;
  const lines = [heading, "", notification.message];
  const earliest = notification.metadata.earliestMatchingDate;
  const count = notification.metadata.matchingAppointmentCount;
  const filter = notification.metadata.filter;
  if (typeof earliest === "string" && earliest) lines.push("", "Earliest matching appointment", earliest);
  if (typeof count === "number") lines.push("", "Matching appointments", String(count));
  if (typeof filter === "string" && filter) lines.push("", "Filter", filter);
  if (notification.url) {
    lines.push("", notification.isSimulation ? "Booking URL (for reference only)" : "Open booking page", notification.url);
  }
  lines.push("", "Detected", formatDetectedAt(notification));
  return lines.join("\n");
}

export function telegramReplyMarkup(notification: Notification): object | undefined {
  const customerKey = notification.metadata.telegramCustomerKey;
  const alertId = notification.metadata.alertId;
  if (notification.isSimulation || typeof customerKey !== "string" || typeof alertId !== "string") return undefined;
  return {
    inline_keyboard: [[
      { text: "✅ I booked it", callback_data: `b:${customerKey}:${alertId}` },
      { text: "❌ Keep looking", callback_data: `n:${customerKey}:${alertId}` }
    ]]
  };
}

export class TelegramNotifier implements NotificationProvider {
  readonly name = "telegram";

  constructor(
    private readonly botToken: string,
    private readonly chatId: string,
    private readonly timeoutMs = 10_000,
    private readonly fetchFn: TelegramFetch = globalThis.fetch
  ) {}

  async notify(notification: Notification, chatId = this.chatId): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const replyMarkup = telegramReplyMarkup(notification);
      const response = await this.fetchFn(
        `https://api.telegram.org/bot${this.botToken}/sendMessage`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: formatTelegramMessage(notification),
            disable_web_page_preview: false,
            ...(replyMarkup ? { reply_markup: replyMarkup } : {})
          }),
          signal: controller.signal
        }
      );
      if (!response.ok) {
        const body = await response.text();
        throw new Error(
          `Telegram HTTP error ${response.status}: ${body}`
        );
      }
      let payload: TelegramResponse;
      try {
        payload = await response.json() as TelegramResponse;
      } catch {
        throw new Error("Telegram returned a malformed response");
      }
      if (typeof payload?.ok !== "boolean") throw new Error("Telegram returned a malformed response");
      if (!payload.ok) throw new Error(`Telegram API error: ${payload.description || "unknown error"}`);
    } catch (error) {
      if (controller.signal.aborted) throw new Error(`Telegram request timed out after ${this.timeoutMs}ms`);
      const safeMessage = error instanceof Error ? error.message : String(error);
      throw new Error(redact(safeMessage, [this.botToken, this.chatId, chatId]));
    } finally {
      clearTimeout(timeout);
    }
  }
}
