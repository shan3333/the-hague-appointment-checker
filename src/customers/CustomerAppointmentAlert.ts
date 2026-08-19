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
  filter?: string;
}): NotificationDraft {
  const { customer, matchingDates, now, timezone, isSimulation, alertId, location } = options;
  const filter = options.filter ?? describeDateFilter(customer.filter);
  const service = getAppointmentService(customer.service);
  const simulationNotice = isSimulation
    ? "This is a simulated appointment notification. No real appointment website was checked. No booking was attempted.\n\n"
    : "";
  const locationDetails = location
    ? `\n\nLocation:\n${location}`
    : "";
  const appointmentDetails = matchingDates[0]
    ? `Earliest matching date:\n${matchingDates[0]}${locationDetails}`
    : `A possible appointment was reported available.${locationDetails}`;
  return {
    title: isSimulation ? "🧪 Simulation: The Hague Appointment Available" : "The Hague appointment detected",
    message: `${simulationNotice}Appointment type:\n${service.name}\n\n${appointmentDetails}\n\nYour monitoring preference:\n${filter}\n\nA matching appointment was available when we checked.\n\nAvailability can change quickly. This alert does not reserve an appointment.\n\nDid you manage to book it?`,
    isSimulation,
    url: service.bookingUrl,
    timestamp: now,
    metadata: {
      ...(matchingDates[0] ? { earliestMatchingDate: matchingDates[0] } : {}),
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
