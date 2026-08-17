import { config } from "./config.js";
import { logger } from "./logger.js";
import { createNotification } from "./notifications/Notification.js";
import { TelegramNotifier } from "./notifications/TelegramNotifier.js";
import { activateCustomer, loadLifecycleCustomers } from "./customers/CustomerLifecycle.js";
import { updateCustomersState } from "./customers/CustomerState.js";

const customerId = process.argv[2]?.trim();
if (!customerId) throw new Error("Customer ID is required. Example: npm run customer:activate -- customer-001");
if (!config.telegramBotToken) throw new Error("Customer activation requires TELEGRAM_BOT_TOKEN");

const mode = config.appointmentMode === "real" ? "real" : "simulation";
const customers = await loadLifecycleCustomers(mode, config.customersConfigPaths);
const notifier = new TelegramNotifier(config.telegramBotToken, "");

try {
  await activateCustomer({
    customers,
    customerId,
    now: new Date(),
    timezone: config.timezone,
    isSimulation: mode === "simulation",
    sender: {
      send: async (draft, chatId) => notifier.notify(createNotification(draft), chatId)
    },
    log: {
      info: message => logger.info(message),
      error: message => logger.error(message)
    }
  });
  const statePath = mode === "real" ? config.customerStatePath : config.simulationCustomerStatePath;
  await updateCustomersState(statePath, state => {
    const previous = state.customers[customerId];
    state.customers[customerId] = {
      ...previous,
      status: "active",
      activatedAt: new Date().toISOString(),
      bookedAt: null,
      stoppedAt: null,
      statusSource: undefined,
      lastMatchingDates: previous?.lastMatchingDates ?? [],
      lastCheckedAt: previous?.lastCheckedAt ?? null,
      lastNotifiedAt: previous?.lastNotifiedAt ?? null,
      expiryNotificationSent: previous?.expiryNotificationSent ?? false,
      alerts: previous?.alerts ?? []
    };
  });
} catch {
  process.exitCode = 1;
}
