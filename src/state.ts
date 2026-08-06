import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AppointmentStatus } from "./types.js";

export interface CheckerState {
  lastDefinitiveStatus: "AVAILABLE" | "NOT_AVAILABLE" | null;
  lastCheckStatus: AppointmentStatus | null;
  lastCheckedAt: string | null;
  lastNotifiedAt: string | null;
  lastRawStatus: AppointmentStatus | null;
  lastAvailableAppointmentDates: string[];
  lastMatchingAppointmentDates: string[];
}

export const emptyState: CheckerState = {
  lastDefinitiveStatus: null,
  lastCheckStatus: null,
  lastCheckedAt: null,
  lastNotifiedAt: null,
  lastRawStatus: null,
  lastAvailableAppointmentDates: [],
  lastMatchingAppointmentDates: []
};

export async function loadState(file: string): Promise<CheckerState> {
  try {
    return { ...emptyState, ...JSON.parse(await readFile(file, "utf8")) as CheckerState };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { ...emptyState };
    throw error;
  }
}

export async function saveState(file: string, state: CheckerState): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  await rename(temporary, file);
}

export function shouldNotify(status: AppointmentStatus): boolean {
  return status === "AVAILABLE";
}

export function matchingDatesChanged(previous: CheckerState, current: readonly string[]): boolean {
  return previous.lastMatchingAppointmentDates.join("|") !== [...current].sort().join("|");
}

export interface StateDateDetails {
  rawStatus?: AppointmentStatus;
  availableDates?: readonly string[];
  matchingDates?: readonly string[];
}

export function nextState(
  previous: CheckerState,
  status: AppointmentStatus,
  now: Date,
  notified: boolean,
  details: StateDateDetails = {}
): CheckerState {
  return {
    lastDefinitiveStatus: status === "AVAILABLE" || status === "NOT_AVAILABLE" ? status : previous.lastDefinitiveStatus,
    lastCheckStatus: status,
    lastCheckedAt: now.toISOString(),
    lastNotifiedAt: notified ? now.toISOString() : previous.lastNotifiedAt,
    lastRawStatus: details.rawStatus ?? status,
    lastAvailableAppointmentDates: [...(details.availableDates ?? [])],
    lastMatchingAppointmentDates: [...(details.matchingDates ?? [])]
  };
}
