import { DateTime } from "luxon";
import { describeDateFilter } from "../dateFilter.js";
import type { NotificationDraft } from "../notifications/Notification.js";
import {
  loadCustomers,
  resolveCustomersConfigPath,
  type CustomerConfig,
  type CustomerConfigurationMode,
  type CustomerConfigurationPaths
} from "./CustomerConfig.js";

export interface LifecycleNotificationSender {
  send(notification: NotificationDraft, chatId: string): Promise<void>;
}

export interface LifecycleLog {
  info(message: string): void;
  error(message: string): void;
}

export async function loadLifecycleCustomers(
  mode: CustomerConfigurationMode,
  paths: CustomerConfigurationPaths
): Promise<CustomerConfig[]> {
  return loadCustomers(resolveCustomersConfigPath(mode, paths));
}

export function isCustomerExpired(customer: CustomerConfig, now: Date, timezone: string): boolean {
  const today = DateTime.fromJSDate(now, { zone: timezone }).toISODate();
  if (!today) throw new Error(`Could not calculate current date in ${timezone}`);
  return customer.expiresAt < today;
}

function displayDate(value: string, timezone: string): string {
  const date = DateTime.fromISO(value, { zone: timezone, locale: "en" });
  return date.isValid ? date.toFormat("d LLLL yyyy") : value;
}

export function activationNotification(
  customer: CustomerConfig,
  timezone: string,
  isSimulation: boolean
): NotificationDraft {
  const simulationNotice = isSimulation
    ? "This is a SIMULATION lifecycle notification. No real customer configuration was used.\n\n"
    : "";
  return {
    title: isSimulation ? "🧪 Simulation: Appointment monitoring is active" : "✅ Appointment monitoring is active",
    message: `${simulationNotice}Location: The Hague\nPreference: ${describeDateFilter(customer.filter)}\nMonitoring until: ${displayDate(customer.expiresAt, timezone)}\n\nWe'll send an alert here when matching appointment availability is detected.\n\nAvailability is monitored only. Appointments are not reserved or guaranteed.`,
    isSimulation,
    metadata: { timezone, lifecycle: "activation" }
  };
}

export function expiryNotification(
  customer: CustomerConfig,
  timezone: string,
  isSimulation: boolean
): NotificationDraft {
  const simulationNotice = isSimulation
    ? "This is a SIMULATION lifecycle notification. No real customer configuration was used.\n\n"
    : "";
  return {
    title: isSimulation ? "🧪 Simulation: Monitoring period ended" : "⏰ Your monitoring period has ended",
    message: `${simulationNotice}Your The Hague appointment monitoring ended on ${displayDate(customer.expiresAt, timezone)}.\n\nNo further appointment alerts will be sent.\n\nThank you for using the service.`,
    isSimulation,
    metadata: { timezone, lifecycle: "expiry" }
  };
}

export async function activateCustomer(options: {
  customers: readonly CustomerConfig[];
  customerId: string;
  now: Date;
  timezone: string;
  isSimulation: boolean;
  sender: LifecycleNotificationSender;
  log: LifecycleLog;
}): Promise<void> {
  const { customers, customerId, now, timezone, isSimulation, sender, log } = options;
  const customer = customers.find(candidate => candidate.id === customerId);
  if (!customer) {
    const message = `Unknown customer: ${customerId}`;
    log.error(message);
    throw new Error(message);
  }
  if (!customer.enabled) {
    const message = `Customer ${customerId} is disabled`;
    log.error(message);
    throw new Error(message);
  }
  if (isCustomerExpired(customer, now, timezone)) {
    const message = `Customer ${customerId} monitoring has expired`;
    log.error(message);
    throw new Error(message);
  }
  try {
    await sender.send(activationNotification(customer, timezone, isSimulation), customer.chatId);
    log.info(`Activation notification sent for customer ${customer.id}.`);
  } catch (error) {
    log.error(`Activation notification failed for customer ${customer.id}: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}
