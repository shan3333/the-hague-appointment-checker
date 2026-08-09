import type { CustomerConfig } from "./CustomerConfig.js";

export interface CustomerCycleLog {
  info(message: string): void;
  error(message: string): void;
}

export function logMonitoringRoundComplete(log: CustomerCycleLog): void {
  log.info("----------------------------------------");
}

export async function runWithReloadedCustomers(options: {
  load(): Promise<CustomerConfig[]>;
  run(customers: readonly CustomerConfig[]): Promise<void>;
  log: CustomerCycleLog;
}): Promise<"completed" | "skipped"> {
  let customers: CustomerConfig[];
  try {
    customers = await options.load();
  } catch (error) {
    options.log.error(`Customer configuration reload failed: ${error instanceof Error ? error.message : String(error)}`);
    options.log.info("Skipping customer monitoring cycle; will retry next cycle.");
    return "skipped";
  }
  options.log.info(`Loaded ${customers.length} customer configurations for this cycle.`);
  await options.run(customers);
  return "completed";
}
