import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export interface CustomerNotificationState {
  service?: string;
  status?: CustomerStatus;
  activatedAt?: string | null;
  bookedAt?: string | null;
  stoppedAt?: string | null;
  statusSource?: "manual" | "telegram";
  lastMatchingDates: string[];
  lastCheckedAt: string | null;
  lastNotifiedAt: string | null;
  expiryNotificationSent: boolean;
  alerts?: CustomerAlert[];
}

export type CustomerStatus = "active" | "booked" | "stopped" | "expired";

export interface CustomerAlert {
  alertId: string;
  sentAt: string;
  response: "booked" | "keep-looking" | null;
  respondedAt: string | null;
}

export interface CustomersState {
  customers: Record<string, CustomerNotificationState>;
}

export const emptyCustomersState: CustomersState = { customers: {} };

export async function loadCustomersState(file: string): Promise<CustomersState> {
  try {
    const parsed = JSON.parse(await readFile(file, "utf8")) as Partial<CustomersState>;
    return { customers: parsed.customers ?? {} };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { customers: {} };
    throw error;
  }
}

export async function saveCustomersState(file: string, state: CustomersState): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  await rename(temporary, file);
}

export async function updateCustomersState<T>(
  file: string,
  update: (state: CustomersState) => T | Promise<T>
): Promise<T> {
  const lock = `${file}.lock`;
  await mkdir(path.dirname(file), { recursive: true });
  for (let attempt = 0; ; attempt += 1) {
    try {
      await mkdir(lock);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST" || attempt >= 100) throw error;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  }
  try {
    const state = await loadCustomersState(file);
    const result = await update(state);
    await saveCustomersState(file, state);
    return result;
  } finally {
    await rm(lock, { recursive: true, force: true });
  }
}

export function mergeCustomersState(latest: CustomersState, monitored: CustomersState): CustomersState {
  for (const [customerId, incoming] of Object.entries(monitored.customers)) {
    const current = latest.customers[customerId];
    if (!current) {
      latest.customers[customerId] = incoming;
      continue;
    }
    const alerts = new Map((incoming.alerts ?? []).map(alert => [alert.alertId, alert]));
    for (const alert of current.alerts ?? []) {
      const candidate = alerts.get(alert.alertId);
      alerts.set(alert.alertId, alert.response ? alert : candidate ?? alert);
    }
    latest.customers[customerId] = {
      ...incoming,
      status: current.status && current.status !== "active" ? current.status : incoming.status,
      bookedAt: current.bookedAt ?? incoming.bookedAt,
      stoppedAt: current.stoppedAt ?? incoming.stoppedAt,
      statusSource: current.statusSource ?? incoming.statusSource,
      activatedAt: current.activatedAt ?? incoming.activatedAt,
      alerts: [...alerts.values()]
    };
  }
  return latest;
}

export function matchingDatesDiffer(previous: readonly string[], current: readonly string[]): boolean {
  return [...previous].sort().join("|") !== [...current].sort().join("|");
}

export function customerStatus(state: CustomerNotificationState | undefined): CustomerStatus {
  return state?.status ?? "active";
}
