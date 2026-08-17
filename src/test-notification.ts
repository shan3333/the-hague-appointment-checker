import { logger } from "./logger.js";
import { config } from "./config.js";
import { NotificationService } from "./notifications/NotificationService.js";
import { buildCustomerAppointmentAlert } from "./customers/CustomerAppointmentAlert.js";
import { createAlertId } from "./customers/CustomerAlertIdentity.js";
import { TEST_NOTIFICATION_CUSTOMER_ID, testNotificationCustomer } from "./test-notification-customer.js";
import { DateTime } from "luxon";
import type { NotificationDraft } from "./notifications/Notification.js";
import { pathToFileURL } from "node:url";
import { updateCustomersState } from "./customers/CustomerState.js";

export function buildTestAppointmentAlert(
  now = new Date(),
  alertId = createAlertId(),
  chatId = config.telegramChatId,
  timezone = config.timezone
): NotificationDraft {
  const matchingDate = DateTime.fromJSDate(now, { zone: timezone }).plus({ days: 7 }).toISODate();
  if (!matchingDate) throw new Error(`Could not create a test appointment date in ${timezone}`);
  return buildCustomerAppointmentAlert({
    customer: testNotificationCustomer(chatId),
    matchingDates: [matchingDate],
    now,
    timezone,
    isSimulation: false,
    alertId
  });
}

export async function prepareTestNotificationState(
  file: string,
  draft: NotificationDraft
): Promise<void> {
  const alertId = draft.metadata?.alertId;
  const sentAt = draft.timestamp instanceof Date
    ? draft.timestamp.toISOString()
    : draft.timestamp ?? new Date().toISOString();
  if (typeof alertId !== "string") throw new Error("Test appointment alert is missing an alert ID");
  await updateCustomersState(file, state => {
    const previous = state.customers[TEST_NOTIFICATION_CUSTOMER_ID];
    state.customers[TEST_NOTIFICATION_CUSTOMER_ID] = {
      ...previous,
      status: "active",
      activatedAt: previous?.activatedAt ?? sentAt,
      bookedAt: null,
      lastMatchingDates: previous?.lastMatchingDates ?? [],
      lastCheckedAt: previous?.lastCheckedAt ?? null,
      lastNotifiedAt: sentAt,
      expiryNotificationSent: false,
      alerts: [
        ...(previous?.alerts ?? []).filter(alert => alert.alertId !== alertId),
        { alertId, sentAt, response: null, respondedAt: null }
      ]
    };
  });
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
