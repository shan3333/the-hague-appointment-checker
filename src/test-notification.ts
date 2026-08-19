import { logger } from "./logger.js";
import { config } from "./config.js";
import { NotificationService } from "./notifications/NotificationService.js";
import { createAlertId } from "./customers/CustomerAlertIdentity.js";
import { DateTime } from "luxon";
import type { NotificationDraft } from "./notifications/Notification.js";
import { pathToFileURL } from "node:url";
import { buildStandaloneAppointmentAlert, prepareStandaloneAppointmentAlertState } from "./standalone-appointment-alert.js";

export function buildTestAppointmentAlert(
  now = new Date(),
  alertId = createAlertId(),
  chatId = config.telegramChatId,
  timezone = config.timezone
): NotificationDraft {
  const matchingDate = DateTime.fromJSDate(now, { zone: timezone }).plus({ days: 7 }).toISODate();
  if (!matchingDate) throw new Error(`Could not create a test appointment date in ${timezone}`);
  return buildStandaloneAppointmentAlert({
    matchingDates: [matchingDate],
    now,
    timezone,
    chatId,
    isSimulation: false,
    alertId
  });
}

export async function prepareTestNotificationState(
  file: string,
  draft: NotificationDraft
): Promise<void> {
  await prepareStandaloneAppointmentAlertState(file, draft);
}

export async function runTestNotification(): Promise<void> {
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

  const draft = buildTestAppointmentAlert();
  await prepareTestNotificationState(config.testNotificationStatePath, draft);
  const result = await service.notify(draft);
  for (const delivery of result.deliveries) {
    console.log(`${delivery.channel}: ${delivery.success ? "sent successfully" : "failed"}`);
  }
  if (result.deliveries.some(delivery => !delivery.success)) {
    logger.error("One or more standalone notification channels failed");
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await runTestNotification();
