import { DateTime } from "luxon";
import type { AppointmentStatus } from "./types.js";

export type WithinUnit = "d" | "w" | "m";

export type DateFilter =
  | { kind: "within"; amount: number; unit: WithinUnit; source: string }
  | { kind: "before"; date: string }
  | { kind: "between"; startDate: string; endDate: string };

export interface DateRange {
  start: string;
  end: string | null;
  today: string;
}

export interface DateFilterEvaluation {
  status: AppointmentStatus;
  availableDates: string[];
  matchingDates: string[];
  rejectedDates: string[];
  rejectedBeforeStart: string[];
  rejectedAfterEnd: string[];
  rejectedPastDates: string[];
}

export function parseDateOnly(value: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const parsed = DateTime.fromISO(value, { zone: "UTC" });
  return parsed.isValid && parsed.toISODate() === value ? value : undefined;
}

export function parseWithinDuration(value: string): Extract<DateFilter, { kind: "within" }> {
  const match = /^(\d+)([dwm])$/.exec(value);
  if (!match) {
    throw new Error("--within must use a positive duration such as 7d, 2w, or 1m");
  }
  const amount = Number(match[1]);
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error("--within duration must be greater than zero");
  }
  return { kind: "within", amount, unit: match[2] as WithinUnit, source: value };
}

export function parseDateFilterArgs(args: readonly string[]): DateFilter | undefined {
  let filter: DateFilter | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const option = args[index];
    if (option !== "--within" && option !== "--before" && option !== "--between") {
      throw new Error(`Unknown option: ${option ?? ""}`);
    }
    if (filter) throw new Error("Only one of --within, --before, or --between may be used");
    const firstValue = args[index + 1];
    if (!firstValue || firstValue.startsWith("--")) {
      throw new Error(option === "--between" ? "--between requires a start date and an end date" : `${option} requires a value`);
    }
    index += 1;
    if (option === "--within") {
      filter = parseWithinDuration(firstValue);
    } else if (option === "--before") {
      const date = parseDateOnly(firstValue);
      if (!date) throw new Error("--before must be a valid date in YYYY-MM-DD format");
      filter = { kind: "before", date };
    } else {
      const secondValue = args[index + 1];
      if (!secondValue || secondValue.startsWith("--")) {
        throw new Error("--between requires a start date and an end date");
      }
      index += 1;
      const startDate = parseDateOnly(firstValue);
      if (!startDate) throw new Error("--between start date must be a valid date in YYYY-MM-DD format");
      const endDate = parseDateOnly(secondValue);
      if (!endDate) throw new Error("--between end date must be a valid date in YYYY-MM-DD format");
      if (startDate > endDate) {
        throw new Error("Invalid --between range: start date must be on or before end date");
      }
      filter = { kind: "between", startDate, endDate };
    }
  }
  return filter;
}

export function calculateDateRange(
  referenceDate: Date,
  filter: DateFilter | undefined,
  timezone: string
): DateRange {
  const today = DateTime.fromJSDate(referenceDate, { zone: timezone }).startOf("day");
  if (!today.isValid) throw new Error(`Invalid timezone: ${timezone}`);
  const start = today.toISODate();
  if (!start) throw new Error("Could not calculate today's date");
  if (!filter) return { start, end: null, today: start };
  if (filter.kind === "before") return { start, end: filter.date, today: start };
  if (filter.kind === "between") {
    return { start: filter.startDate, end: filter.endDate, today: start };
  }
  const end = filter.unit === "d"
    ? today.plus({ days: filter.amount })
    : filter.unit === "w"
      ? today.plus({ weeks: filter.amount })
      : today.plus({ months: filter.amount });
  const endDate = end.toISODate();
  if (!endDate) throw new Error("Could not calculate date-filter end date");
  return { start, end: endDate, today: start };
}

export function isAppointmentWithinRange(appointmentDate: string, range: DateRange): boolean {
  const date = parseDateOnly(appointmentDate);
  if (!date || date < range.today || date < range.start) return false;
  return range.end === null || date <= range.end;
}

export function filterAppointmentsByDateRange(
  appointments: readonly string[],
  range: DateRange
): string[] {
  return [...new Set(appointments.filter(date => isAppointmentWithinRange(date, range)))].sort();
}

export function evaluateDateFilter(
  status: AppointmentStatus,
  appointments: readonly string[],
  range: DateRange,
  explicitFilter: boolean
): DateFilterEvaluation {
  const availableDates = [...new Set(appointments.flatMap(date => parseDateOnly(date) ?? []))].sort();
  const matchingDates = filterAppointmentsByDateRange(availableDates, range);
  const rejectedDates = availableDates.filter(date => !matchingDates.includes(date));
  const rejectedPastDates = rejectedDates.filter(date => date < range.today);
  const rejectedBeforeStart = rejectedDates.filter(date => date >= range.today && date < range.start);
  const rejectedAfterEnd = range.end === null ? [] : rejectedDates.filter(date => date > range.end!);
  const details = { availableDates, matchingDates, rejectedDates, rejectedBeforeStart, rejectedAfterEnd, rejectedPastDates };
  if (status !== "AVAILABLE") return { status, ...details, matchingDates: [] };
  if (explicitFilter) {
    return { status: matchingDates.length > 0 ? "AVAILABLE" : "NOT_AVAILABLE", ...details };
  }
  if (availableDates.length > 0 && matchingDates.length === 0) {
    return { status: "NOT_AVAILABLE", ...details };
  }
  return { status, ...details };
}

export function describeDateFilter(filter: DateFilter | undefined): string {
  if (!filter) return "any future appointment";
  if (filter.kind === "before") return `on or before ${filter.date}`;
  if (filter.kind === "between") return `between ${filter.startDate} and ${filter.endDate}`;
  const unit = filter.unit === "d" ? "day" : filter.unit === "w" ? "week" : "calendar month";
  return `within ${filter.amount} ${unit}${filter.amount === 1 ? "" : "s"}`;
}

export function selectSimulationDates(
  fallbackDates: readonly string[],
  dateSequence: readonly (readonly string[])[],
  checkNumber: number | undefined,
  repeat: boolean
): string[] {
  if (dateSequence.length === 0 || checkNumber === undefined) return [...fallbackDates];
  const rawIndex = Math.max(0, checkNumber - 1);
  const index = repeat ? rawIndex % dateSequence.length : Math.min(rawIndex, dateSequence.length - 1);
  return [...(dateSequence[index] ?? [])];
}
