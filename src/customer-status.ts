import { pathToFileURL } from "node:url";
import { config } from "./config.js";
import { loadCustomers } from "./customers/CustomerConfig.js";
import { updateCustomerStatus, type CustomerAdminAction } from "./customers/CustomerAdmin.js";

export function parseCustomerStatusArgs(args: readonly string[]): { action: CustomerAdminAction; customerId: string } {
  const action = args[0];
  if (action !== "booked" && action !== "stop") throw new Error("Customer status action must be booked or stop");
  const customerId = args[1]?.trim();
  if (!customerId) throw new Error(`Customer ID is required. Example: npm run customer:${action} -- customer-001`);
  return { action, customerId };
}

export async function runCustomerStatusCommand(args = process.argv.slice(2)): Promise<void> {
  const { action, customerId } = parseCustomerStatusArgs(args);
  const customers = await loadCustomers(config.customersConfigPaths.real);
  const result = await updateCustomerStatus({
    customers,
    customerId,
    action,
    stateFile: config.customerStatePath,
    now: new Date(),
    timezone: config.timezone
  });
  const label = action === "booked" ? "booked" : "stopped";
  console.log(result === "already-applied"
    ? `Customer ${customerId} is already ${label}. Monitoring remains stopped.`
    : `Customer ${customerId} marked as ${label}. Monitoring stopped.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await runCustomerStatusCommand();
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
