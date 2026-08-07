import { logger } from "./logger.js";
import { config } from "./config.js";
import { NotificationService } from "./notifications/NotificationService.js";

const service = new NotificationService({
  provider: config.notificationProvider,
  enableSound: config.enableSound,
  desktopEnabled: config.enableDesktopNotification,
  telegram: config.telegram
});

console.log(`Platform: ${service.platform}`);
console.log(`Desktop provider: ${service.providerName}`);
console.log(`Desktop enabled: ${config.enableDesktopNotification}`);
console.log(`Telegram enabled: ${config.telegram.enabled}`);

const result = await service.notify({
  title: "🧪 Simulation: The Hague Appointment Available",
  message: "This is a simulated appointment notification. No real appointment website was checked. No booking was attempted. This is a notification-system test. Booking URL is included for reference only.",
  isSimulation: true,
  url: config.url,
  metadata: { timezone: config.timezone, test: true }
});
for (const delivery of result.deliveries) {
  console.log(`${delivery.channel}: ${delivery.success ? "sent successfully" : "failed"}`);
}
if (result.deliveries.some(delivery => !delivery.success)) {
  logger.error("One or more standalone notification channels failed");
  process.exitCode = 1;
}
