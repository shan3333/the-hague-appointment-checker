import { DateTime } from "luxon";
import type { Notification } from "./Notification.js";
import type { NotificationProvider } from "./NotificationProvider.js";

export type TelegramFetch = typeof fetch;

interface TelegramResponse {
  ok: boolean;
  description?: string;
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
  const lines = [`🎉 ${notification.title}`, "", notification.message];
  const earliest = notification.metadata.earliestMatchingDate;
  const count = notification.metadata.matchingAppointmentCount;
  const filter = notification.metadata.filter;
  if (typeof earliest === "string" && earliest) lines.push("", "Earliest matching appointment", earliest);
  if (typeof count === "number") lines.push("", "Matching appointments", String(count));
  if (typeof filter === "string" && filter) lines.push("", "Filter", filter);
  if (notification.url) lines.push("", "Open booking page", notification.url);
  lines.push("", "Detected", formatDetectedAt(notification));
  return lines.join("\n");
}

export class TelegramNotifier implements NotificationProvider {
  readonly name = "telegram";

  constructor(
    private readonly botToken: string,
    private readonly chatId: string,
    private readonly timeoutMs = 10_000,
    private readonly fetchFn: TelegramFetch = globalThis.fetch
  ) {}

  async notify(notification: Notification): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchFn(
        `https://api.telegram.org/bot${this.botToken}/sendMessage`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            chat_id: this.chatId,
            text: formatTelegramMessage(notification),
            disable_web_page_preview: false
          }),
          signal: controller.signal
        }
      );
      if (!response.ok) throw new Error(`Telegram HTTP error ${response.status}`);
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
      throw new Error(safeMessage
        .replaceAll(this.botToken, "[REDACTED]")
        .replaceAll(this.chatId, "[REDACTED]"));
    } finally {
      clearTimeout(timeout);
    }
  }
}
