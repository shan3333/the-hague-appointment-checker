import { calculateDateRange, describeDateFilter, evaluateDateFilter } from "../dateFilter.js";
import type { NotificationDraft } from "../notifications/Notification.js";
import type { AppointmentStatus } from "../types.js";
import type { CustomerConfig } from "./CustomerConfig.js";
import { matchingDatesDiffer, type CustomersState } from "./CustomerState.js";
import { expiryNotification, isCustomerExpired } from "./CustomerLifecycle.js";
import { getAppointmentService } from "../appointmentServices.js";

export interface CustomerNotificationSender {
  send(notification: NotificationDraft, chatId: string): Promise<void>;
}

export interface CustomerLog {
  info(message: string): void;
  error(message: string): void;
}

export interface CustomerEvaluationSummary {
  evaluated: number;
  expired: number;
  disabled: number;
  customersWithMatches: number;
  notificationsAttempted: number;
  notificationsSent: number;
  notificationsFailed: number;
}

function dates(values: readonly string[]): string {
  return values.join(", ") || "NONE";
}

export function logCustomerAvailability(options: {
  status: AppointmentStatus;
  appointmentDates: readonly string[];
  isSimulation: boolean;
  log: CustomerLog;
}): void {
  const { status, appointmentDates, log } = options;
  log.info(`Raw status: ${status}`);
  log.info(`Available appointment dates: ${dates(appointmentDates)}`);
  log.info(`Total available appointment dates: ${appointmentDates.length}`);
}

export function logCustomerSummary(summary: CustomerEvaluationSummary, log: CustomerLog): void {
  log.info("Customer evaluation complete");
  log.info(`Active customers: ${summary.evaluated}`);
  log.info(`Customers with matching appointments: ${summary.customersWithMatches}`);
  log.info(`Notifications attempted: ${summary.notificationsAttempted}`);
  log.info(`Notifications succeeded: ${summary.notificationsSent}`);
  log.info(`Notifications failed: ${summary.notificationsFailed}`);
}

export async function evaluateCustomers(options: {
  customers: readonly CustomerConfig[];
  state: CustomersState;
  status: AppointmentStatus;
  appointmentDates: readonly string[];
  now: Date;
  timezone: string;
  isSimulation: boolean;
  sender: CustomerNotificationSender;
  log: CustomerLog;
}): Promise<CustomerEvaluationSummary> {
  const { customers, state, status, appointmentDates, now, timezone, isSimulation, sender, log } = options;
  let evaluated = 0;
  let expired = 0;
  let disabled = 0;
  let customersWithMatches = 0;
  let notificationsAttempted = 0;
  let notificationsSent = 0;
  let notificationsFailed = 0;

  for (const customer of customers) {
    if (!customer.enabled) {
      disabled += 1;
      continue;
    }
    const stored = state.customers[customer.id];
    // Legacy state predates service IDs and could only have come from product 35.
    const previous = stored?.service === customer.service ||
      (stored?.service === undefined && customer.service === "brp_existing_bsn") ? stored : undefined;
    const effectivePrevious = previous ?? {
      lastMatchingDates: [], lastCheckedAt: null, lastNotifiedAt: null, expiryNotificationSent: false
    };
    if (isCustomerExpired(customer, now, timezone)) {
      // Expiry delivery is per customer lifecycle, independent of appointment service.
      const lifecyclePrevious = stored ?? effectivePrevious;
      expired += 1;
      log.info(`Customer ${customer.id} monitoring expired.`);
      let expirySent = lifecyclePrevious.expiryNotificationSent ?? false;
      if (!expirySent) {
        notificationsAttempted += 1;
        try {
          await sender.send(expiryNotification(customer, timezone, isSimulation), customer.chatId);
          expirySent = true;
          notificationsSent += 1;
          log.info(`  Expiry notification: SENT`);
        } catch (error) {
          notificationsFailed += 1;
          log.error(`Expiry notification failed for customer ${customer.id}: ${error instanceof Error ? error.message : String(error)}`);
          log.info("  Expiry notification: FAILED");
        }
      } else {
        log.info("  Expiry notification: ALREADY SENT");
      }
      state.customers[customer.id] = {
        service: customer.service,
        lastMatchingDates: lifecyclePrevious.lastMatchingDates,
        lastCheckedAt: now.toISOString(),
        lastNotifiedAt: expirySent && !lifecyclePrevious.expiryNotificationSent ? now.toISOString() : lifecyclePrevious.lastNotifiedAt,
        expiryNotificationSent: expirySent
      };
      continue;
    }
    evaluated += 1;
    const range = calculateDateRange(now, customer.filter, timezone);
    const evaluation = evaluateDateFilter(status, appointmentDates, range, true);
    const matchingDates = evaluation.matchingDates;
    if (matchingDates.length > 0) customersWithMatches += 1;
    const changed = matchingDatesDiffer(effectivePrevious.lastMatchingDates, matchingDates);
    const shouldSend = matchingDates.length > 0 && changed;
    log.info(`Customer ${customer.id}`);
    log.info(`  Filter: ${describeDateFilter(customer.filter)}`);
    log.info(`  Matching dates: ${dates(matchingDates)}`);
    log.info(`  Rejected dates: ${dates(evaluation.rejectedDates)}`);
    log.info(`  Earliest matching date: ${matchingDates[0] ?? "NONE"}`);
    log.info(`  Previous matching dates: ${dates(effectivePrevious.lastMatchingDates)}`);
    log.info(`  Matching dates changed: ${changed}`);
    let sent = false;
    if (shouldSend) {
      notificationsAttempted += 1;
      const filter = describeDateFilter(customer.filter);
      const simulationNotice = isSimulation
        ? "This is a simulated appointment notification. No real appointment website was checked. No booking was attempted.\n\n"
        : "";
      const service = getAppointmentService(customer.service);
      try {
        await sender.send({
          title: isSimulation ? "🧪 Simulation: The Hague Appointment Available" : "The Hague appointment detected",
          message: `${simulationNotice}Appointment type:\n${service.name}\n\nEarliest matching date:\n${matchingDates[0]}\n\nYour monitoring preference:\n${filter}\n\nA matching appointment was available when we checked.\n\nAvailability can change quickly. This alert does not reserve an appointment.`,
          isSimulation,
          url: service.bookingUrl,
          timestamp: now,
          metadata: {
            earliestMatchingDate: matchingDates[0]!,
            matchingAppointmentCount: matchingDates.length,
            filter,
            timezone,
            serviceId: service.id
          }
        }, customer.chatId);
        notificationsSent += 1;
        sent = true;
        log.info("  Notification: SENT");
      } catch (error) {
        notificationsFailed += 1;
        log.error(`Notification failed for customer ${customer.id}: ${error instanceof Error ? error.message : String(error)}`);
        log.info("  Notification: FAILED");
      }
    } else {
      log.info("  Notification: NOT NEEDED");
    }
    state.customers[customer.id] = {
      service: customer.service,
      lastMatchingDates: shouldSend && !sent ? effectivePrevious.lastMatchingDates : [...matchingDates],
      lastCheckedAt: now.toISOString(),
      lastNotifiedAt: sent ? now.toISOString() : effectivePrevious.lastNotifiedAt,
      expiryNotificationSent: effectivePrevious.expiryNotificationSent ?? false
    };
  }
  return {
    evaluated,
    expired,
    disabled,
    customersWithMatches,
    notificationsAttempted,
    notificationsSent,
    notificationsFailed
  };
}
