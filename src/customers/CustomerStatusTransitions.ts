import { customerStatus, type CustomerNotificationState } from "./CustomerState.js";

export type CustomerStatusSource = "manual" | "telegram";
export type CustomerTransitionResult = "changed" | "already-applied";

export class InvalidCustomerTransitionError extends Error {}

export function markCustomerBooked(
  state: CustomerNotificationState,
  now: Date,
  source: CustomerStatusSource
): CustomerTransitionResult {
  const status = customerStatus(state);
  if (status === "booked") return "already-applied";
  if (status !== "active") throw new InvalidCustomerTransitionError(`Cannot mark customer booked from status=${status}`);
  state.status = "booked";
  state.bookedAt = now.toISOString();
  state.statusSource = source;
  return "changed";
}

export function stopCustomer(
  state: CustomerNotificationState,
  now: Date,
  source: CustomerStatusSource
): CustomerTransitionResult {
  const status = customerStatus(state);
  if (status === "stopped") return "already-applied";
  if (status !== "active") throw new InvalidCustomerTransitionError(`Cannot stop customer from status=${status}`);
  state.status = "stopped";
  state.stoppedAt = now.toISOString();
  state.statusSource = source;
  return "changed";
}
