import { logger } from "./logger.js";
import { config } from "./config.js";
import { NotificationService } from "./notifications/NotificationService.js";

const service = new NotificationService({
  provider: config.notificationProvider,
  enableSound: config.enableSound
});

console.log(`Platform: ${service.platform}`);
console.log(`Provider: ${service.providerName}`);

try {
  await service.notify(
    "The Hague Appointment Checker",
    "A possible appointment is available. Open the website now."
  );
  console.log("Notification sent successfully");
} catch (error) {
  logger.error("Standalone desktop notification failed", { error: String(error) });
  process.exitCode = 1;
}
