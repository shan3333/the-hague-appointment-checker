import { readFile } from "node:fs/promises";
import { parseDateFilterArgs, parseDateOnly, type DateFilter } from "../dateFilter.js";

export type CustomerConfigurationMode = "real" | "simulation";

export interface CustomerConfigurationPaths {
  real: string;
  simulation: string;
}

export function resolveCustomersConfigPath(
  mode: CustomerConfigurationMode,
  paths: CustomerConfigurationPaths
): string {
  return mode === "real" ? paths.real : paths.simulation;
}

export interface CustomerConfig {
  id: string;
  chatId: string;
  enabled: boolean;
  filter: DateFilter;
  expiresAt: string;
}

function object(value: unknown, index: number): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Customer entry ${index + 1} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requiredString(entry: Record<string, unknown>, field: string, identity: string): string {
  const value = entry[field];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${identity}: ${field} is required`);
  return value.trim();
}

export function parseCustomerFilter(value: unknown, identity: string): DateFilter {
  const filter = object(value, 0);
  const type = requiredString(filter, "type", identity);
  try {
    if (type === "before") return parseDateFilterArgs(["--before", requiredString(filter, "date", identity)])!;
    if (type === "within") return parseDateFilterArgs(["--within", requiredString(filter, "value", identity)])!;
    if (type === "between") {
      return parseDateFilterArgs([
        "--between",
        requiredString(filter, "start", identity),
        requiredString(filter, "end", identity)
      ])!;
    }
  } catch (error) {
    throw new Error(`${identity}: invalid filter: ${error instanceof Error ? error.message : String(error)}`);
  }
  throw new Error(`${identity}: unsupported filter type "${type}"`);
}

export function parseCustomers(value: unknown): CustomerConfig[] {
  if (!Array.isArray(value)) throw new Error("Customer configuration must be a JSON array");
  const ids = new Set<string>();
  return value.map((raw, index) => {
    const entry = object(raw, index);
    const identity = `Customer entry ${index + 1}`;
    const id = requiredString(entry, "id", identity);
    if (ids.has(id)) throw new Error(`Duplicate customer id: ${id}`);
    ids.add(id);
    if (typeof entry.enabled !== "boolean") throw new Error(`Customer ${id}: enabled must be true or false`);
    const chatId = requiredString(entry, "chatId", `Customer ${id}`);
    const expiresAt = requiredString(entry, "expiresAt", `Customer ${id}`);
    if (!parseDateOnly(expiresAt)) throw new Error(`Customer ${id}: expiresAt must be a valid YYYY-MM-DD date`);
    return {
      id,
      chatId,
      enabled: entry.enabled,
      filter: parseCustomerFilter(entry.filter, `Customer ${id}`),
      expiresAt
    };
  });
}

export async function loadCustomers(file: string): Promise<CustomerConfig[]> {
  let contents: string;
  try {
    contents = await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`Customer configuration file not found. Create: ${file}`);
    }
    throw error;
  }
  try {
    return parseCustomers(JSON.parse(contents) as unknown);
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error(`Customer configuration is not valid JSON: ${file}`);
    throw error;
  }
}
