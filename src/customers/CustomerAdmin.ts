import type { CustomerConfig } from "./CustomerConfig.js";
import { isCustomerExpired } from "./CustomerLifecycle.js";
import { updateCustomersState, type CustomerNotificationState } from "./CustomerState.js";
import { markCustomerBooked, stopCustomer, type CustomerTransitionResult } from "./CustomerStatusTransitions.js";

export type CustomerAdminAction = "booked" | "stop";

function initialCustomerState(customer: CustomerConfig): CustomerNotificationState {
  return {
    service: customer.service,
    status: "active",
    activatedAt: null,
    bookedAt: null,
    stoppedAt: null,
    lastMatchingDates: [],
    lastCheckedAt: null,
    lastNotifiedAt: null,
    expiryNotificationSent: false,
    alerts: []
  };
}

export async function updateCustomerStatus(options: {
  customers: readonly CustomerConfig[];
  customerId: string;
  action: CustomerAdminAction;
  stateFile: string;
  now: Date;
  timezone: string;
}): Promise<CustomerTransitionResult> {
  const customer = options.customers.find(candidate => candidate.id === options.customerId);
  if (!customer) throw new Error(`Unknown customer: ${options.customerId}`);
  if (isCustomerExpired(customer, options.now, options.timezone)) {
    throw new Error(`Customer ${options.customerId} monitoring has expired`);
  }
  return updateCustomersState(options.stateFile, state => {
    const stored = state.customers[customer.id] ?? initialCustomerState(customer);
    if (!customer.enabled && options.action === "booked") {
      throw new Error(`Customer ${customer.id} is disabled`);
    }
    const result = options.action === "booked"
      ? markCustomerBooked(stored, options.now, "manual")
      : stopCustomer(stored, options.now, "manual");
    state.customers[customer.id] = stored;
    return result;
  });
}
