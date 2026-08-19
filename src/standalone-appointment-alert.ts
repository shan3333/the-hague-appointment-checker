import { buildCustomerAppointmentAlert } from "./customers/CustomerAppointmentAlert.js";
import { createAlertId } from "./customers/CustomerAlertIdentity.js";
import { updateCustomersState } from "./customers/CustomerState.js";
import type { NotificationDraft } from "./notifications/Notification.js";
import { TEST_NOTIFICATION_CUSTOMER_ID, testNotificationCustomer } from "./test-notification-customer.js";

export function buildStandaloneAppointmentAlert(options: {
  matchingDates: readonly string[];
  now: Date;
  timezone: string;
  chatId: string;
  isSimulation: boolean;
  filter?: string;
  alertId?: string;
}): NotificationDraft {
  return buildCustomerAppointmentAlert({
    customer: testNotificationCustomer(options.chatId),
    matchingDates: options.matchingDates,
    now: options.now,
    timezone: options.timezone,
    isSimulation: options.isSimulation,
    alertId: options.alertId ?? createAlertId(),
    filter: options.filter
  });
}

export async function prepareStandaloneAppointmentAlertState(
  file: string,
  draft: NotificationDraft
): Promise<void> {
  const alertId = draft.metadata?.alertId;
  const sentAt = draft.timestamp instanceof Date
    ? draft.timestamp.toISOString()
    : draft.timestamp ?? new Date().toISOString();
  if (typeof alertId !== "string") throw new Error("Standalone appointment alert is missing an alert ID");
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
