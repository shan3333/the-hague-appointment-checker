import { parseDateFilterArgs, type DateFilter } from "../dateFilter.js";

export interface CustomerCliOptions {
  customersMode: boolean;
  dateFilter: DateFilter | undefined;
}

export function parseCustomerCliOptions(args: readonly string[]): CustomerCliOptions {
  const customerFlags = args.filter(argument => argument === "--customers");
  if (customerFlags.length > 1) throw new Error("--customers may only be specified once");
  const customersMode = customerFlags.length === 1;
  const filterArgs = args.filter(argument => argument !== "--customers");
  if (customersMode && filterArgs.length > 0) {
    throw new Error("--customers cannot be combined with --within, --before, or --between");
  }
  return { dateFilter: parseDateFilterArgs(filterArgs), customersMode };
}
