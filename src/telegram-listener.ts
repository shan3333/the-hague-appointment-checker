import { config } from "./config.js";
import { loadCustomers } from "./customers/CustomerConfig.js";
import { telegramCustomerKey } from "./customers/CustomerAlertIdentity.js";
import { customerStatus, updateCustomersState, type CustomerAlert, type CustomersState } from "./customers/CustomerState.js";
import { logger } from "./logger.js";
import { pathToFileURL } from "node:url";
import { TEST_NOTIFICATION_CUSTOMER_ID, testNotificationCustomer } from "./test-notification-customer.js";
import { markCustomerBooked } from "./customers/CustomerStatusTransitions.js";
import { access } from "node:fs/promises";

export const BOOKED_CONFIRMATION_MESSAGE = "Great, glad you managed to book an appointment! 🎉 Monitoring has now been stopped.";

export interface TelegramCallbackQuery {
  id: string;
  data?: string;
  message?: { chat?: { id?: string | number } };
}

export interface TelegramCallbackApi {
  answerCallbackQuery(id: string, text: string): Promise<void>;
  sendMessage(chatId: string, text: string): Promise<void>;
}

export interface CallbackLog {
  info(message: string): void;
  error(message: string): void;
}

export type CallbackHandlingResult = "booked" | "keep-looking" | "inactive" | "unauthorized" | "malformed" | "unknown";

export function selectCustomerCallbackMode(
  customerKey: string | undefined,
  realCustomers: readonly { id: string }[],
  simulationCustomers: readonly { id: string }[]
): "real" | "simulation" | undefined {
  const matchesKey = (customer: { id: string }) => telegramCustomerKey(customer.id) === customerKey;
  if (realCustomers.some(matchesKey)) return "real";
  if (simulationCustomers.some(matchesKey)) return "simulation";
  return undefined;
}

async function telegramCall(call: () => Promise<void>, log: CallbackLog): Promise<void> {
  try {
    await call();
  } catch (error) {
    log.error(`[TELEGRAM] Callback response failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function parseCallbackData(data: string | undefined): { response: "booked" | "keep-looking"; customerKey: string; alertId: string } | undefined {
  const match = /^([bn]):([a-f0-9]{8}):([a-f0-9]{8})$/.exec(data ?? "");
  if (!match) return undefined;
  return { response: match[1] === "b" ? "booked" : "keep-looking", customerKey: match[2]!, alertId: match[3]! };
}

export async function handleTelegramCallback(options: {
  callback: TelegramCallbackQuery;
  customers: readonly { id: string; chatId: string }[];
  state: CustomersState;
  api: TelegramCallbackApi;
  now?: Date;
  log: CallbackLog;
}): Promise<CallbackHandlingResult> {
  const parsed = parseCallbackData(options.callback.data);
  if (!parsed) {
    options.log.error("[TELEGRAM] Ignored malformed callback data");
    return "malformed";
  }
  const matches = options.customers.filter(customer => telegramCustomerKey(customer.id) === parsed.customerKey);
  if (matches.length !== 1) {
    await telegramCall(() => options.api.answerCallbackQuery(options.callback.id, "This alert is no longer recognized."), options.log);
    options.log.error("[TELEGRAM] Ignored callback for unknown or ambiguous customer");
    return "unknown";
  }
  const customer = matches[0]!;
  const callbackChat = options.callback.message?.chat?.id;
  if (callbackChat === undefined || String(callbackChat) !== customer.chatId) {
    await telegramCall(() => options.api.answerCallbackQuery(options.callback.id, "This alert belongs to another chat."), options.log);
    options.log.error(`[TELEGRAM] Rejected callback for ${customer.id}: chat mismatch`);
    return "unauthorized";
  }
  const nowDate = options.now ?? new Date();
  const now = nowDate.toISOString();
  const stored = options.state.customers[customer.id] ?? {
    status: "active" as const, lastMatchingDates: [], lastCheckedAt: null, lastNotifiedAt: null,
    expiryNotificationSent: false, alerts: []
  };
  const existing = stored.alerts?.find(alert => alert.alertId === parsed.alertId);
  const alert: CustomerAlert = existing ?? {
    alertId: parsed.alertId, sentAt: now, response: null, respondedAt: null
  };
  if (existing?.response === "booked" || customerStatus(stored) === "booked") {
    await telegramCall(() => options.api.answerCallbackQuery(options.callback.id, "Monitoring is already stopped."), options.log);
    return "booked";
  }
  if (existing?.response === "keep-looking" && parsed.response === "keep-looking") {
    await telegramCall(() => options.api.answerCallbackQuery(options.callback.id, "Already noted — I'll keep looking."), options.log);
    return "keep-looking";
  }
  if (customerStatus(stored) !== "active") {
    await telegramCall(() => options.api.answerCallbackQuery(options.callback.id, `Monitoring is already ${customerStatus(stored)}.`), options.log);
    options.log.info(`[TELEGRAM] ${customer.id} callback ignored: status=${customerStatus(stored)}`);
    return "inactive";
  }
  alert.response = parsed.response;
  alert.respondedAt = now;
  stored.alerts = [...(stored.alerts ?? []).filter(candidate => candidate.alertId !== alert.alertId), alert];
  if (parsed.response === "booked") {
    markCustomerBooked(stored, nowDate, "telegram");
    options.state.customers[customer.id] = stored;
    await telegramCall(() => options.api.answerCallbackQuery(options.callback.id, "Booking confirmed — monitoring stopped."), options.log);
    await telegramCall(() => options.api.sendMessage(customer.chatId, BOOKED_CONFIRMATION_MESSAGE), options.log);
    options.log.info(`[TELEGRAM] ${customer.id} confirmed BOOKED from alert ${parsed.alertId}`);
    return "booked";
  }
  options.state.customers[customer.id] = stored;
  await telegramCall(() => options.api.answerCallbackQuery(options.callback.id, "Got it — I'll keep looking."), options.log);
  await telegramCall(() => options.api.sendMessage(customer.chatId, "Got it — I'll keep monitoring for you."), options.log);
  options.log.info(`[TELEGRAM] ${customer.id} responded KEEP_LOOKING to alert ${parsed.alertId}`);
  return "keep-looking";
}

interface TelegramUpdate { update_id: number; callback_query?: TelegramCallbackQuery }

export async function resolveCallbackTarget(data: string | undefined): Promise<{
  customers: readonly { id: string; chatId: string }[];
  statePath: string;
}> {
  const parsed = parseCallbackData(data);
  const isTestNotification = parsed?.customerKey === telegramCustomerKey(TEST_NOTIFICATION_CUSTOMER_ID);
  if (isTestNotification) {
    return { customers: [testNotificationCustomer(config.telegramChatId)], statePath: config.testNotificationStatePath };
  }

  const loadIfPresent = async (file: string) => {
    try {
      await access(file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    return loadCustomers(file);
  };
  const [realCustomers, simulationCustomers] = await Promise.all([
    loadIfPresent(config.customersConfigPaths.real),
    loadIfPresent(config.customersConfigPaths.simulation)
  ]);
  const callbackMode = selectCustomerCallbackMode(parsed?.customerKey, realCustomers, simulationCustomers);
  if (callbackMode === "real") {
    return { customers: realCustomers, statePath: config.customerStatePath };
  }
  if (callbackMode === "simulation") {
    return { customers: simulationCustomers, statePath: config.simulationCustomerStatePath };
  }
  return { customers: realCustomers, statePath: config.customerStatePath };
}

class TelegramLongPollingApi implements TelegramCallbackApi {
  constructor(private readonly token: string) {}
  private async call(method: string, body: object): Promise<unknown> {
    const response = await fetch(`https://api.telegram.org/bot${this.token}/${method}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body)
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Telegram HTTP error ${response.status}: ${body}`
      );
    }
    const payload = await response.json() as { ok?: boolean; result?: unknown; description?: string };
    if (!payload.ok) throw new Error(`Telegram API error: ${payload.description ?? "unknown error"}`);
    return payload.result;
  }
  answerCallbackQuery(id: string, text: string): Promise<void> {
    return this.call("answerCallbackQuery", { callback_query_id: id, text }).then(() => undefined);
  }
  sendMessage(chatId: string, text: string): Promise<void> {
    return this.call("sendMessage", { chat_id: chatId, text }).then(() => undefined);
  }
  async getUpdates(offset: number): Promise<TelegramUpdate[]> {
    return await this.call("getUpdates", { offset, timeout: 30, allowed_updates: ["callback_query"] }) as TelegramUpdate[];
  }
}

export async function runTelegramListener(): Promise<never> {
  if (!config.telegramBotToken) throw new Error("telegram:listen requires TELEGRAM_BOT_TOKEN");
  const api = new TelegramLongPollingApi(config.telegramBotToken);
  let offset = 0;
  logger.info("[TELEGRAM] Callback listener started");
  for (;;) {
    try {
      const updates = await api.getUpdates(offset);
      for (const update of updates) {
        if (update.callback_query) {
          const { customers, statePath } = await resolveCallbackTarget(update.callback_query.data);
          await updateCustomersState(statePath, state => handleTelegramCallback({
            callback: update.callback_query!, customers, state, api,
            log: { info: message => logger.info(message), error: message => logger.error(message) }
          }));
        }
        offset = Math.max(offset, update.update_id + 1);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`[TELEGRAM] Polling error: ${message.replaceAll(config.telegramBotToken, "[REDACTED]")}`);
      await new Promise(resolve => setTimeout(resolve, 2_000));
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await runTelegramListener();
