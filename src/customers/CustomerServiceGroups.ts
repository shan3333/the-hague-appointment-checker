import type { AppointmentServiceId } from "../appointmentServices.js";
import type { CustomerConfig } from "./CustomerConfig.js";
import { isCustomerExpired } from "./CustomerLifecycle.js";
import { customerStatus, type CustomersState } from "./CustomerState.js";

export function groupActiveCustomersByService(
  customers: readonly CustomerConfig[],
  now: Date,
  timezone: string,
  state?: CustomersState
): Map<AppointmentServiceId, CustomerConfig[]> {
  const groups = new Map<AppointmentServiceId, CustomerConfig[]>();
  for (const customer of customers) {
    if (!customer.enabled || isCustomerExpired(customer, now, timezone) || customerStatus(state?.customers[customer.id]) === "booked") continue;
    const group = groups.get(customer.service) ?? [];
    group.push(customer);
    groups.set(customer.service, group);
  }
  return groups;
}

export async function forEachActiveServiceGroup<T>(
  groups: ReadonlyMap<AppointmentServiceId, readonly CustomerConfig[]>,
  check: (serviceId: AppointmentServiceId) => Promise<T>,
  evaluate: (serviceId: AppointmentServiceId, customers: readonly CustomerConfig[], result: T) => Promise<void>
): Promise<void> {
  for (const [serviceId, customers] of groups) {
    const result = await check(serviceId);
    await evaluate(serviceId, customers, result);
  }
}
