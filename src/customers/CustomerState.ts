import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export interface CustomerNotificationState {
  lastMatchingDates: string[];
  lastCheckedAt: string | null;
  lastNotifiedAt: string | null;
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

export function matchingDatesDiffer(previous: readonly string[], current: readonly string[]): boolean {
  return [...previous].sort().join("|") !== [...current].sort().join("|");
}
