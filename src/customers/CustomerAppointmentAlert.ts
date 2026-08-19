import { describeDateFilter } from "../dateFilter.js";
import { getAppointmentService } from "../appointmentServices.js";
import type { NotificationDraft } from "../notifications/Notification.js";
import type { CustomerConfig } from "./CustomerConfig.js";
import { telegramCustomerKey } from "./CustomerAlertIdentity.js";

export function buildCustomerAppointmentAlert(options: {
  customer: CustomerConfig;
  matchingDates: readonly string[];
  now: Date;
  timezone: string;
  isSimulation: boolean;
  alertId: string;
  location?: string;
}): NotificationDraft {
  const { customer, matchingDates, now, timezone, isSimulation, alertId, location } = options;
  if (!matchingDates[0]) throw new Error("An appointment alert requires at least one matching date");
  const filter = describeDateFilter(customer.filter);
  const service = getAppointmentService(customer.service);
  const simulationNotice = isSimulation
    ? "This is a simulated appointment notification. No real appointment website was checked. No booking was attempted.\n\n"
    : "";
  const locationDetails = location
    ? `\n\nLocation:\n${location}`
    : "";
  const feedbackPrompt = isSimulation ? "" : "\n\nDid you manage to book it?";
  return {
    title: isSimulation ? "🧪 Simulation: The Hague Appointment Available" : "The Hague appointment detected",
    message: `${simulationNotice}Appointment type:\n${service.name}\n\nEarliest matching date:\n${matchingDates[0]}${locationDetails}\n\nYour monitoring preference:\n${filter}\n\nA matching appointment was available when we checked.\n\nAvailability can change quickly. This alert does not reserve an appointment.${feedbackPrompt}`,
    isSimulation,
    url: service.bookingUrl,
    timestamp: now,
    metadata: {
      earliestMatchingDate: matchingDates[0],
      matchingAppointmentCount: matchingDates.length,
      filter,
      timezone,
      serviceId: service.id,
      alertId,
      telegramCustomerKey: telegramCustomerKey(customer.id),
      ...(location ? { location } : {})
    }
  };
}
