import { config } from "./config.js";
import { logger } from "./logger.js";
import { createNotification } from "./notifications/Notification.js";
import { TelegramNotifier } from "./notifications/TelegramNotifier.js";
import { activateCustomer, loadLifecycleCustomers } from "./customers/CustomerLifecycle.js";

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
} catch {
  process.exitCode = 1;
}
